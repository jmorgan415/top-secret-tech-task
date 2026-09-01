import { parseNpmAuditReport, runNpmAuditCli } from "../adapters/npm-audit.js";
import { scanDependencyHygiene } from "../adapters/dependency-hygiene.js";
import { scanDockerfileLint } from "../adapters/dockerfile-lint.js";
import { scanSecrets } from "../adapters/secret-scanning.js";
import type { Finding } from "../schema/finding.js";

export function runAllScanners(projectRoot: string): Finding[] {
  return [
    ...parseNpmAuditReport(runNpmAuditCli(projectRoot), projectRoot),
    ...scanDependencyHygiene(projectRoot),
    ...scanDockerfileLint(projectRoot),
    ...scanSecrets(projectRoot),
  ];
}
