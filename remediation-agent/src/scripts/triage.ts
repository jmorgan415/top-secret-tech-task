import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAllScanners } from "../pipeline/scan.js";
import { runTriage, selectTriageCandidates } from "../agents/triage.js";
import { requireAuth } from "../util/require-auth.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

await requireAuth();

const findings = runAllScanners(PROJECT_ROOT);

const candidates = selectTriageCandidates(findings);
console.log(`${findings.length} findings scanned; ${candidates.length} resources selected for triage (high/critical severity):`);
for (const c of candidates) {
  console.log(`  ${c.file}::${c.identifier} (${c.findings.length} finding${c.findings.length === 1 ? "" : "s"})`);
}

console.log("\nRunning triage agent (Cursor SDK, read-only, local)...\n");
const verdicts = await runTriage(PROJECT_ROOT, findings);

for (const v of verdicts) {
  console.log(`\n${v.resourceFile}::${v.resourceIdentifier}`);
  console.log(`  reachable: ${v.reachable}  action: ${v.recommendedAction}  confidence: ${v.confidence}`);
  console.log(`  reasoning: ${v.reasoning}`);
}
