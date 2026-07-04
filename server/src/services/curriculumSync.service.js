import fs from "fs";
import path from "path";
import matter from "gray-matter";
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
              templateStatus: "DRAFT",
              sourcePath: topicSlug,
            },
          });
        }
        diff.added.topics.push(manifest.slug);
      } else {
        const needsUpdate =
          existing.name !== manifest.name ||
          existing.description !== description ||
          existing.category !== manifest.category ||
          existing.estimatedHoursToMastery !== (manifest.estimatedHoursToMastery ?? null);
        if (needsUpdate) {
          if (!dryRun) {
            await tx.topicTemplate.update({
              where: { slug: manifest.slug },
              data: {
                name: manifest.name,
                description,
                category: manifest.category,
                estimatedHoursToMastery: manifest.estimatedHoursToMastery ?? null,
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
          templateStatus: "DRAFT",
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
    }
    // Task 10 handles topics. Task 11 adds concepts. Labs come in Task 12.
    // Removal detection deferred (needs full-tree awareness).
  };

  if (dryRun) {
    await prisma.$transaction(async (tx) => {
      await run(tx);
      throw new Error("__DRY_RUN__");
    }).catch((err) => {
      if (err.message !== "__DRY_RUN__") throw err;
    });
  } else {
    await prisma.$transaction(run);
  }

  return diff;
}
