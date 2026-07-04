import fs from "fs";
import path from "path";
import matter from "gray-matter";
import prisma from "../lib/prisma.js";
// eslint-disable-next-line no-unused-vars
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
    }
    // Task 10 handles topics only. Concepts + labs come in Tasks 11 + 12.
    // Removal detection deferred to those tasks (needs full-tree awareness).
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
