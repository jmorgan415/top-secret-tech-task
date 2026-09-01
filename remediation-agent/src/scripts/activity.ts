import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "@cursor/sdk";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

// Local agents (what this project uses exclusively — see agents/triage.ts and
// agents/fix.ts) never sync to the cursor.com dashboard; that's cloud-only. This reads
// the same on-disk history back out instead, scoped to this project's cwd.
const { items } = await Agent.list({ runtime: "local", cwd: PROJECT_ROOT, limit: 50 });

console.log(`${items.length} local agent run(s) recorded for ${PROJECT_ROOT}\n`);

const sorted = [...items].sort((a, b) => b.lastModified - a.lastModified);
for (const agent of sorted) {
  const created = agent.createdAt ? new Date(agent.createdAt).toISOString() : "unknown time";
  console.log(`${created}  [${agent.status ?? "unknown"}]  ${agent.agentId}`);
  console.log(`  ${agent.summary || agent.name}`);
}
