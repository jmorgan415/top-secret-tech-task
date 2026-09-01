import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Finding,
  makeFindingId,
  type Advisory,
  type Severity,
} from "../schema/finding.js";

// npm's 5-level scale collapses onto our 4-level one; "info" carries no actionable
// remediation so it's folded into "low" rather than dropped.
const SEVERITY_MAP: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  moderate: "medium",
  low: "low",
  info: "low",
};

interface NpmAuditAdvisory {
  source?: number;
  title?: string;
  url?: string;
  cvss?: { score?: number };
}

interface NpmAuditVulnerability {
  name: string;
  severity: string;
  isDirect: boolean;
  via: (NpmAuditAdvisory | string)[];
  nodes: string[];
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
}

interface NpmAuditReport {
  vulnerabilities: Record<string, NpmAuditVulnerability>;
}

export function runNpmAuditCli(projectRoot: string): NpmAuditReport {
  try {
    const stdout = execFileSync("npm", ["audit", "--json"], {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 32,
    });
    return JSON.parse(stdout);
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities are found; the JSON we want is still on stdout.
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return JSON.parse(stdout);
    throw err;
  }
}

function readInstalledVersion(projectRoot: string, pkgName: string): string | undefined {
  try {
    const pkgJsonPath = join(projectRoot, "node_modules", pkgName, "package.json");
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    return typeof pkgJson.version === "string" ? pkgJson.version : undefined;
  } catch {
    return undefined;
  }
}

export function parseNpmAuditReport(report: NpmAuditReport, projectRoot: string): Finding[] {
  const findings: Finding[] = [];

  for (const vuln of Object.values(report.vulnerabilities)) {
    const advisories: Advisory[] = vuln.via
      .filter((v): v is NpmAuditAdvisory => typeof v === "object" && Boolean(v.title))
      .map((v) => ({
        id: v.source !== undefined ? String(v.source) : v.title!,
        title: v.title!,
        url: v.url,
        cvss: v.cvss?.score,
      }));

    const fixedVersion =
      typeof vuln.fixAvailable === "object" ? vuln.fixAvailable.version : undefined;

    // Only present at the top level (i.e. not "node_modules/x/node_modules/lodash")
    // is the version we can read directly out of node_modules for this package name.
    const isTopLevel = vuln.nodes.includes(`node_modules/${vuln.name}`);

    const resource = { file: "package.json", identifier: vuln.name };

    findings.push(
      Finding.parse({
        id: makeFindingId("npm-audit", "dependency-vulnerability", resource),
        source: "npm-audit",
        type: "dependency-vulnerability",
        severity: SEVERITY_MAP[vuln.severity] ?? "medium",
        title: `${advisories.length} known advisor${advisories.length === 1 ? "y" : "ies"} for ${vuln.name}`,
        description: advisories.map((a) => a.title).join("; ") || `Vulnerable range ${vuln.name}`,
        resource,
        evidence: {
          currentVersion: isTopLevel ? readInstalledVersion(projectRoot, vuln.name) : undefined,
          fixedVersion,
          direct: vuln.isDirect,
          advisories,
          raw: vuln,
        },
        detectedAt: new Date().toISOString(),
      })
    );
  }

  return findings;
}
