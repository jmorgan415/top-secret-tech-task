import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "../pipeline/plan.js";
import { runFixPipeline } from "../pipeline/fix.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

const { decisions } = await buildPlan(PROJECT_ROOT);
const { branch, results } = await runFixPipeline(PROJECT_ROOT, decisions);

console.log(`Fix pipeline ran on branch ${branch}\n`);
for (const r of results) {
  console.log(`${r.resourceFile}::${r.resourceIdentifier} [${r.action}] -> ${r.outcome}`);
  if (r.outcome === "applied") console.log(`  ${r.summary}`);
  if (r.rejectionReason) console.log(`  reason: ${r.rejectionReason}`);
}
