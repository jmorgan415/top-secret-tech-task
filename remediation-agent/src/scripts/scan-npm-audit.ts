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

const production = findings.filter((f) => f.evidence.production);
console.log(`\nProduction dependencies with findings (${production.length}):`);
for (const f of production) {
  console.log(
    `  [${f.severity}] ${f.resource.identifier}@${f.evidence.currentVersion ?? "?"} -> ${
      f.evidence.fixedVersion ?? "no fix available"
    } (${f.title})`
  );
}

const directDev = findings.filter((f) => f.evidence.direct && !f.evidence.production);
console.log(`\nDirect devDependencies with findings (${directDev.length}; not addressable):`);
for (const f of directDev) {
  console.log(`  [${f.severity}] ${f.resource.identifier} (${f.title})`);
}
