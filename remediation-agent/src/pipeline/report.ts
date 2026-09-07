import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding } from "../schema/finding.js";
import type { PolicyDecision } from "../schema/policy.js";
import type { TriageVerdict } from "../schema/triage.js";
import type { RemediationOutcome } from "./fix.js";
import { selectOverrides } from "../policy/gate.js";
import { OVERRIDE_RULE_LABEL } from "../util/format-verdicts.js";

// Lives under remediation-agent/reports regardless of what the app repo's own layout is —
// these are run artifacts of the tool, not source, so they're gitignored rather than committed.
const REPORTS_DIR = resolve(fileURLToPath(import.meta.url), "../../../reports");

export interface RemediationReport {
  generatedAt: string;
  projectRoot: string;
  branch?: string;
  findings: Finding[];
  verdicts: TriageVerdict[];
  decisions: PolicyDecision[];
  outcomes: RemediationOutcome[];
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function toMarkdown(report: RemediationReport): string {
  const lines: string[] = [];
  lines.push(`# Remediation report — ${report.generatedAt}`);
  lines.push("");
  lines.push(`- Project: \`${report.projectRoot}\``);
  if (report.branch) lines.push(`- Branch: \`${report.branch}\``);
  lines.push("");

  const overrides = selectOverrides(report.decisions);
  lines.push(`## Policy overrides (${overrides.length})`);
  lines.push("");
  lines.push(
    "Deterministic gate rules that set the action instead of taking the triage agent's recommendation. This is the proof that policy can override the model."
  );
  lines.push("");
  if (overrides.length === 0) {
    lines.push("_No override rule fired this run._");
    lines.push("");
  } else {
    lines.push("| Resource | Triage said | Gate did | Rule |");
    lines.push("|---|---|---|---|");
    for (const d of overrides) {
      const override = d.gateOverride!;
      const from = override.from ?? "(no verdict)";
      const agreed = override.from != null && override.from === override.to ? " (agent agreed)" : "";
      lines.push(
        `| \`${d.resourceFile}::${d.resourceIdentifier}\` | ${from}${agreed} | **${override.to}** | ${escapeCell(OVERRIDE_RULE_LABEL[override.rule])} |`
      );
    }
    lines.push("");
  }

  lines.push(`## Findings (${report.findings.length})`);
  lines.push("");
  lines.push("| Type | Severity | Resource | Title |");
  lines.push("|---|---|---|---|");
  for (const f of report.findings) {
    lines.push(`| ${f.type} | ${f.severity} | \`${f.resource.file}::${f.resource.identifier}\` | ${escapeCell(f.title)} |`);
  }
  lines.push("");

  lines.push(`## Triage verdicts (${report.verdicts.length})`);
  lines.push("");
  lines.push("Raw agent output passed to the policy gate. Groups that never reached triage have no row here.");
  lines.push("");
  lines.push("| Resource | Reachable | Recommended | Confidence | Reasoning |");
  lines.push("|---|---|---|---|---|");
  for (const v of report.verdicts) {
    lines.push(
      `| \`${v.resourceFile}::${v.resourceIdentifier}\` | ${v.reachable} | ${v.recommendedAction} | ${v.confidence} | ${escapeCell(v.reasoning)} |`
    );
  }
  lines.push("");

  lines.push(`## Policy decisions (${report.decisions.length})`);
  lines.push("");
  lines.push("| Resource | Gate | Triage recommended | Rationale |");
  lines.push("|---|---|---|---|");
  for (const d of report.decisions) {
    const recommended = d.triageVerdict?.recommendedAction ?? "—";
    lines.push(
      `| \`${d.resourceFile}::${d.resourceIdentifier}\` | ${d.action} | ${recommended} | ${escapeCell(d.rationale)} |`
    );
  }
  lines.push("");

  if (report.outcomes.length > 0) {
    lines.push(`## Fix + verification outcomes (${report.outcomes.length})`);
    lines.push("");
    lines.push("| Resource | Action | Fix | Verify | Details |");
    lines.push("|---|---|---|---|---|");
    for (const o of report.outcomes) {
      const details = escapeCell(o.verification.details || o.fix.rejectionReason || "");
      lines.push(
        `| \`${o.decision.resourceFile}::${o.decision.resourceIdentifier}\` | ${o.decision.action} | ${o.fix.outcome} | ${o.verification.outcome} | ${details} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReport(report: RemediationReport): { jsonPath: string; markdownPath: string } {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = join(REPORTS_DIR, `${stamp}.json`);
  const markdownPath = join(REPORTS_DIR, `${stamp}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(markdownPath, toMarkdown(report));

  return { jsonPath, markdownPath };
}
