import fs from "fs";
import path from "path";
import matter from "gray-matter";
import yaml from "yaml";
import prisma from "../lib/prisma.js";
import { sanitizeMarkdownToHtml } from "./sanitize.service.js";

const DEFAULT_ROOT = path.resolve(process.cwd(), "curriculum");

function assertSafePath(candidateAbs, rootAbs) {
  const resolved = path.resolve(candidateAbs);
  if (!resolved.startsWith(rootAbs + path.sep) && resolved !== rootAbs) {
    throw new Error(`Path traversal rejected: ${candidateAbs}`);
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink rejected: ${candidateAbs}`);
  }
}

function readTopicManifest(topicDir) {
  const yamlPath = path.join(topicDir, "topic.yml");
  if (!fs.existsSync(yamlPath)) return null;
  assertSafePath(yamlPath, topicDir);
  const raw = fs.readFileSync(yamlPath, "utf8");
  // Wrap yaml so gray-matter parses it as frontmatter.
  const { data } = matter(`---\n${raw}\n---\n`);
  return data;
}

function readDescription(topicDir) {
  const descPath = path.join(topicDir, "description.md");
  if (!fs.existsSync(descPath)) return "";
  assertSafePath(descPath, topicDir);
  return fs.readFileSync(descPath, "utf8");
}

function extractWorkedExample(markdown) {
  // Extract everything after `## Worked example` (case-insensitive) into workedExample,
  // returning [primerBody, workedExample].
  const re = /\n## +worked example\s*\n([\s\S]*?)(?=\n## |\s*$)/i;
  const match = markdown.match(re);
  if (!match) return [markdown, null];
  const primer = markdown.slice(0, match.index).trimEnd();
  const worked = match[1].trim();
  return [primer, worked];
}

function readConceptFiles(topicDir) {
  return fs.readdirSync(topicDir, { withFileTypes: true })
    .filter((e) => e.isFile() && /^\d{2}-[a-z0-9-]+\.md$/.test(e.name))
    .map((e) => e.name);
}

function readArtifacts(labDir) {
  const p = path.join(labDir, "artifacts.yml");
  if (!fs.existsSync(p)) return [];
  assertSafePath(p, labDir);
  const raw = fs.readFileSync(p, "utf8");
  const parsed = yaml.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function readMultiFile(dir, labDirRoot) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile());
  if (entries.length === 0) return null;
  const chunks = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    assertSafePath(p, labDirRoot);
    const content = fs.readFileSync(p, "utf8");
    chunks.push(`// File: ${entry.name}\n${content}`);
  }
  return chunks.join("\n\n");
}

function extractTimeboxMinutes(md) {
  // Matches `**Time-box:** 20 minutes`, `**Time-box:** ~25-30 minutes`, `Timebox: 45min` etc.
  // The `~?\s*` handles the "approximately" tilde; the first digit run is the answer.
  const m = md.match(/time-?box[^:]*:\s*\**\s*~?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function extractLabTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Lab";
}

/**
 * Sync all topic templates under `root`. Idempotent; wraps writes in a
 * $transaction so any error rolls back the entire run.
 */
export async function syncCurriculumTemplates({ root = DEFAULT_ROOT, dryRun = false } = {}) {
  const rootAbs = path.resolve(root);
  if (!fs.existsSync(rootAbs)) {
    throw new Error(`Curriculum root does not exist: ${rootAbs}`);
  }
  const rootStat = fs.lstatSync(rootAbs);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Curriculum root cannot be a symlink: ${rootAbs}`);
  }

  const diff = {
    added:   { topics: [], concepts: [], labs: [] },
    updated: { topics: [], concepts: [], labs: [] },
    removed: { topics: [], concepts: [], labs: [] },
  };

  const topicSlugs = fs.readdirSync(rootAbs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name);

  const run = async (tx) => {
    for (const topicSlug of topicSlugs) {
      const topicDir = path.join(rootAbs, topicSlug);
      assertSafePath(topicDir, rootAbs);

      const manifest = readTopicManifest(topicDir);
      if (!manifest) continue;

      const description = readDescription(topicDir);
      const existing = await tx.topicTemplate.findUnique({ where: { slug: manifest.slug } });

      if (!existing) {
        if (!dryRun) {
          await tx.topicTemplate.create({
            data: {
              slug: manifest.slug,
              name: manifest.name,
              description,
              category: manifest.category,
              estimatedHoursToMastery: manifest.estimatedHoursToMastery ?? null,
              templateStatus: "PUBLISHED",
              sourcePath: topicSlug,
            },
          });
        }
        diff.added.topics.push(manifest.slug);
      } else {
        // Promote DRAFT → PUBLISHED on every sync. The repo tree IS the
        // review gate (PR-reviewed content), and there's no separate
        // promote-templates UI. Fixes existing DRAFT rows synced by the
        // pre-fix version of this service.
        const needsUpdate =
          existing.name !== manifest.name ||
          existing.description !== description ||
          existing.category !== manifest.category ||
          existing.estimatedHoursToMastery !== (manifest.estimatedHoursToMastery ?? null) ||
          existing.templateStatus !== "PUBLISHED";
        if (needsUpdate) {
          if (!dryRun) {
            await tx.topicTemplate.update({
              where: { slug: manifest.slug },
              data: {
                name: manifest.name,
                description,
                category: manifest.category,
                estimatedHoursToMastery: manifest.estimatedHoursToMastery ?? null,
                templateStatus: "PUBLISHED",
              },
            });
          }
          diff.updated.topics.push(manifest.slug);
        }
      }

      // Re-fetch the row so we have its id (needed for ConceptTemplate FK).
      const topicRow = await tx.topicTemplate.findUnique({ where: { slug: manifest.slug } });
      if (!topicRow && !dryRun) continue;

      const conceptFiles = readConceptFiles(topicDir);
      for (const fname of conceptFiles) {
        const filePath = path.join(topicDir, fname);
        assertSafePath(filePath, topicDir);
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = matter(raw);
        const fm = parsed.data;
        const bodyRaw = parsed.content;

        const [primerRaw, workedExample] = extractWorkedExample(bodyRaw);
        const primerHtml = sanitizeMarkdownToHtml(primerRaw);

        const conceptData = {
          topicTemplateId: topicRow?.id,
          slug: fm.slug,
          name: fm.name,
          order: fm.order,
          primerMarkdown: primerRaw,
          primerHtml,
          workedExample,
          canonicalSources: fm.canonicalSources ?? [],
          expectedQuestions: fm.expectedQuestions ?? [],
          assessmentCriteria: fm.assessmentCriteria ?? {},
          readinessRubric: fm.readinessRubric ?? null,
          sourcePath: `${topicSlug}/${fname}`,
          templateStatus: "PUBLISHED",
        };

        const existingConcept = topicRow
          ? await tx.conceptTemplate.findUnique({
              where: { topicTemplateId_slug: { topicTemplateId: topicRow.id, slug: fm.slug } },
            })
          : null;

        if (!existingConcept) {
          if (!dryRun && topicRow) {
            await tx.conceptTemplate.create({ data: conceptData });
          }
          diff.added.concepts.push(`${manifest.slug}/${fm.slug}`);
        } else {
          // Coarse update — overwrite if anything changed. Fine-grained diff is Phase 2.
          if (!dryRun) {
            await tx.conceptTemplate.update({
              where: { id: existingConcept.id },
              data: conceptData,
            });
          }
          diff.updated.concepts.push(`${manifest.slug}/${fm.slug}`);
        }
      }

      // ---- Labs ----
      const labsDir = path.join(topicDir, "labs");
      if (fs.existsSync(labsDir)) {
        const labDirs = fs.readdirSync(labsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory());
        for (const labDirEntry of labDirs) {
          const conceptSlug = labDirEntry.name;
          const labDir = path.join(labsDir, conceptSlug);
          assertSafePath(labDir, topicDir);

          const readmePath = path.join(labDir, "README.md");
          if (!fs.existsSync(readmePath)) continue;
          assertSafePath(readmePath, labDir);
          const readme = fs.readFileSync(readmePath, "utf8");
          const artifacts = readArtifacts(labDir);
          const starterCode = readMultiFile(path.join(labDir, "starter"), labDir);
          const referenceSolution = readMultiFile(path.join(labDir, "reference"), labDir);

          // Find the ConceptTemplate this lab belongs to.
          const conceptRow = topicRow
            ? await tx.conceptTemplate.findUnique({
                where: { topicTemplateId_slug: { topicTemplateId: topicRow.id, slug: conceptSlug } },
              })
            : null;

          if (!conceptRow) {
            continue;  // lab without a concept — skip
          }

          if (referenceSolution == null) {
            throw new Error(`Lab ${conceptSlug} missing reference/ — every lab needs a reference solution.`);
          }

          const labData = {
            conceptTemplateId: conceptRow.id,
            title: extractLabTitle(readme),
            taskMarkdown: readme,
            timeboxMinutes: extractTimeboxMinutes(readme),
            language: "JAVA",
            starterCode,
            referenceSolution,
            expectedArtifacts: artifacts,
            sourcePath: `${topicSlug}/labs/${conceptSlug}`,
            templateStatus: "PUBLISHED",
          };

          const existingLab = await tx.labTemplate.findUnique({
            where: { conceptTemplateId: conceptRow.id },
          });

          if (!existingLab) {
            if (!dryRun) await tx.labTemplate.create({ data: labData });
            diff.added.labs.push(`${manifest.slug}/${conceptSlug}`);
          } else {
            if (!dryRun) {
              await tx.labTemplate.update({ where: { id: existingLab.id }, data: labData });
            }
            diff.updated.labs.push(`${manifest.slug}/${conceptSlug}`);
          }
        }
      }
    }
    // Removal detection deferred (needs full-tree awareness).
  };

  // Interactive-transaction timeout: default 5000ms is too tight once labs
  // (multi-file reads + per-lab upsert) join topics + concepts in the same tx.
  // 30s ceiling matches the Prisma default max, and this sync is admin-invoked
  // + wrapped in a single roundtrip anyway.
  const txOpts = { timeout: 30000, maxWait: 10000 };

  if (dryRun) {
    await prisma.$transaction(async (tx) => {
      await run(tx);
      throw new Error("__DRY_RUN__");
    }, txOpts).catch((err) => {
      if (err.message !== "__DRY_RUN__") throw err;
    });
  } else {
    await prisma.$transaction(run, txOpts);
  }

  return diff;
}
