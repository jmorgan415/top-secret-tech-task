import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "../pipeline/plan.js";
import { runFixPipeline } from "../pipeline/fix.js";
import { runVerification } from "../pipeline/verify.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

console.log("1/4 scanning + triaging...\n");
const { findings, decisions } = await buildPlan(PROJECT_ROOT);
for (const d of decisions) {
  console.log(`  ${d.resourceFile}::${d.resourceIdentifier} -> ${d.action}`);
}

console.log("\n2/4 applying fixes...\n");
const { branch, results } = await runFixPipeline(PROJECT_ROOT, decisions);
console.log(`  branch: ${branch}`);
for (const r of results) {
  console.log(`  ${r.resourceFile}::${r.resourceIdentifier} -> ${r.outcome}${r.rejectionReason ? ` (${r.rejectionReason})` : ""}`);
}

console.log("\n3/4 verifying fixes...\n");
const verifications = await runVerification(PROJECT_ROOT, results);
for (const v of verifications) {
  console.log(`  ${v.resourceFile}::${v.resourceIdentifier} -> ${v.outcome}: ${v.details}`);
}

console.log("\n4/4 summary\n");
console.log(`${findings.length} findings scanned, ${decisions.length} resources triaged.`);
console.log(`${results.filter((r) => r.outcome === "applied").length} fixes applied on ${branch}.`);
console.log(`${verifications.filter((v) => v.outcome === "verified").length} verified, ${verifications.filter((v) => v.outcome === "failed").length} reverted after failing verification.`);
