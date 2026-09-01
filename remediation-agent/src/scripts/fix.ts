import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "../pipeline/plan.js";
import { runFixPipeline } from "../pipeline/fix.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

const { decisions } = await buildPlan(PROJECT_ROOT);
const { branch, outcomes } = await runFixPipeline(PROJECT_ROOT, decisions);

console.log(`Fix pipeline ran on branch ${branch}\n`);
for (const { decision, fix, verification } of outcomes) {
  console.log(`${decision.resourceFile}::${decision.resourceIdentifier} [${decision.action}] -> fix: ${fix.outcome}, verify: ${verification.outcome}`);
  if (fix.outcome === "applied") console.log(`  ${fix.summary}`);
  if (fix.rejectionReason) console.log(`  fix rejected: ${fix.rejectionReason}`);
  console.log(`  ${verification.details}`);
}
