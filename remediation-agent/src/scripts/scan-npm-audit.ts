import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmAuditReport, runNpmAuditCli } from "../adapters/npm-audit.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");

const report = runNpmAuditCli(PROJECT_ROOT);
const findings = parseNpmAuditReport(report, PROJECT_ROOT);

console.log(`Normalized ${findings.length} findings from npm audit (${PROJECT_ROOT})\n`);

const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of findings) bySeverity[f.severity]++;
console.log("By severity:", bySeverity);

const direct = findings.filter((f) => f.evidence.direct);
console.log(`\nDirect dependencies with findings (${direct.length}):`);
for (const f of direct) {
  console.log(
    `  [${f.severity}] ${f.resource.identifier}@${f.evidence.currentVersion ?? "?"} -> ${
      f.evidence.fixedVersion ?? "no fix available"
    } (${f.title})`
  );
}
