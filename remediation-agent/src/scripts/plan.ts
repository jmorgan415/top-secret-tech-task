import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "../pipeline/plan.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

const { findings, decisions } = await buildPlan(PROJECT_ROOT);

console.log(`${findings.length} findings -> ${decisions.length} resource decisions\n`);

for (const action of ["escalate", "draft-for-review", "auto-fix", "no-action"] as const) {
  const group = decisions.filter((d) => d.action === action);
  console.log(`${action} (${group.length}):`);
  for (const d of group) {
    console.log(`  ${d.resourceFile}::${d.resourceIdentifier} — ${d.rationale}`);
  }
  console.log();
}
