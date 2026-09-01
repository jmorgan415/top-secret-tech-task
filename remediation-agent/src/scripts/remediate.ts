import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "../pipeline/plan.js";
import { runFixPipeline } from "../pipeline/fix.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

console.log("1/3 scanning + triaging...\n");
const { findings, decisions } = await buildPlan(PROJECT_ROOT);
for (const d of decisions) {
  console.log(`  ${d.resourceFile}::${d.resourceIdentifier} -> ${d.action}`);
}

console.log("\n2/3 fixing + verifying (one resource at a time)...\n");
const { branch, outcomes } = await runFixPipeline(PROJECT_ROOT, decisions);
console.log(`  branch: ${branch}`);
for (const { decision, fix, verification } of outcomes) {
  console.log(`  ${decision.resourceFile}::${decision.resourceIdentifier} -> fix: ${fix.outcome}, verify: ${verification.outcome}`);
  if (fix.rejectionReason) console.log(`    fix rejected: ${fix.rejectionReason}`);
  console.log(`    ${verification.details}`);
}

console.log("\n3/3 summary\n");
console.log(`${findings.length} findings scanned, ${decisions.length} resources triaged.`);
console.log(`${outcomes.length} resources had a fix attempted on ${branch}.`);
console.log(
  `${outcomes.filter((o) => o.verification.outcome === "verified").length} verified, ` +
    `${outcomes.filter((o) => o.verification.outcome === "failed").length} reverted after failing verification, ` +
    `${outcomes.filter((o) => o.verification.outcome === "skipped").length} skipped verification.`
);
