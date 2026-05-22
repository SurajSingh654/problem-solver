// ============================================================================
// Manual smoke test for services/mcp.service.js — spawns the real Python
// `learn-ai mcp-repo-brain`, calls a couple of tools, prints results.
// Bypasses Express/DB so it's safe to run without a database.
//
// Required env:
//   LEARN_AI_ENABLED=true
//   LEARN_AI_REPO_PATH=/abs/path/to/learn-ai
//
// Run: node scripts/smoke-mcp.js
// ============================================================================

import "dotenv/config";
import { callMcpTool, closeMcpClient } from "../src/services/mcp.service.js";

async function main() {
  console.log("→ search_code");
  const a = await callMcpTool("search_code", { query: "prompt caching", k: 2 });
  console.log(JSON.stringify(a, null, 2).slice(0, 800));

  console.log("\n→ search_docs");
  const b = await callMcpTool("search_docs", { query: "agent vs api", k: 2 });
  console.log(JSON.stringify(b, null, 2).slice(0, 800));

  console.log("\n→ explain_symbol RAGRetriever");
  const c = await callMcpTool("explain_symbol", { name: "RAGRetriever" });
  console.log(JSON.stringify(c, null, 2).slice(0, 800));
}

main()
  .catch((err) => {
    console.error("✗ smoke failed:", err?.code || err?.name, "-", err?.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMcpClient();
  });
