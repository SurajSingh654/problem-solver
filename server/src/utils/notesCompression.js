// ============================================================================
// notesCompression — structural extract for long notes before AI input
// ============================================================================
//
// AI prompts get a hard truncated 8000-char view of the note today. For
// long, well-structured notes (interview prep, study sessions) raw
// truncation lops off the back half — the AI sees only the first
// section. A structural extract gives every section representation:
//
//   1. All H1/H2/H3 headings (preserves outline)
//   2. First ~200 chars of prose per section (preserves intent)
//   3. Up to 5 bullet items per section (preserves enumerable points)
//   4. Up to 2 short code-block fences per section (signals depth without
//      paying the token cost of full code)
//
// The result is a structural summary the AI can summarize / tag /
// flashcard-extract accurately, even when the source is 10K+ chars.
//
// Returns:
//   { content: string, wasCompressed: boolean, originalChars, finalChars }
// ============================================================================

const COMPRESSION_THRESHOLD = 6000;
const TARGET_CHARS = 4500;
const MAX_BULLETS_PER_SECTION = 5;
const MAX_PROSE_PER_SECTION = 240;

function isHeading(line) {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isBullet(line) {
  return /^\s*[-*+]\s+/.test(line);
}

function compressSection(headingLine, bodyLines) {
  const out = [];
  if (headingLine) out.push(headingLine.trim());

  // Strip the body to: lead prose + bullets + at most one short code preview
  const prose = [];
  const bullets = [];
  let codeBlockOpen = false;
  let codePreview = "";

  for (const raw of bodyLines) {
    const line = raw;
    const fence = /^\s{0,3}```/.test(line);
    if (fence) {
      codeBlockOpen = !codeBlockOpen;
      if (!codeBlockOpen && codePreview && !out.some((l) => l === "[code]")) {
        out.push("[code]");
      }
      continue;
    }
    if (codeBlockOpen) {
      if (codePreview.length < 80) codePreview += line.trim() + " ";
      continue;
    }
    if (isBullet(line) && bullets.length < MAX_BULLETS_PER_SECTION) {
      bullets.push(line.trim());
      continue;
    }
    if (line.trim().length > 0 && prose.join(" ").length < MAX_PROSE_PER_SECTION) {
      prose.push(line.trim());
    }
  }

  const proseStr = prose.join(" ").slice(0, MAX_PROSE_PER_SECTION).trim();
  if (proseStr) out.push(proseStr);
  if (bullets.length > 0) out.push(...bullets);

  return out.join("\n");
}

export function prepareNoteContentForAi(rawMarkdown) {
  const original = String(rawMarkdown || "");
  const originalChars = original.length;

  if (originalChars <= COMPRESSION_THRESHOLD) {
    return {
      content: original,
      wasCompressed: false,
      originalChars,
      finalChars: originalChars,
    };
  }

  // Walk lines and group into sections by heading.
  const lines = original.split("\n");
  const sections = [];
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    if (isHeading(line)) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody });
      }
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody });
  }

  const blocks = sections
    .map((s) => compressSection(s.heading, s.body))
    .filter(Boolean);
  let compressed = blocks.join("\n\n");

  // Hard cap as a final guard — should rarely trigger after structural pass.
  if (compressed.length > TARGET_CHARS) {
    compressed = compressed.slice(0, TARGET_CHARS) + "\n\n[… extract truncated …]";
  }

  return {
    content: compressed,
    wasCompressed: true,
    originalChars,
    finalChars: compressed.length,
  };
}
