import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAllScanners } from "../pipeline/scan.js";
import type { FindingType } from "../schema/finding.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");
const findings = runAllScanners(PROJECT_ROOT);

console.log(`Normalized ${findings.length} findings from 4 adapters (${PROJECT_ROOT})`);

const types: FindingType[] = ["dependency-vulnerability", "unused-dependency", "eol-base-image", "hardcoded-secret"];
for (const type of types) {
  const group = findings.filter((f) => f.type === type);
  console.log(`\n${type} (${group.length}):`);
  for (const f of group) {
    console.log(`  [${f.severity}] ${f.resource.identifier} — ${f.title}`);
  }
}
