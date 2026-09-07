import type { GateOverrideRule, PolicyDecision } from "../schema/policy.js";
import type { TriageVerdict } from "../schema/triage.js";

export const OVERRIDE_RULE_LABEL: Record<GateOverrideRule, string> = {
  "hardcoded-secret": "hardcoded secrets always escalate; the agent recommendation is ignored",
  "critical-no-autofix": "a critical-severity finding never auto-applies",
  "confidence-floor": "triage confidence is below the 0.6 floor",
};

export function formatTriageVerdicts(verdicts: TriageVerdict[]): string {
  if (verdicts.length === 0) {
    return "Triage verdicts (0): no addressable high/critical groups were sent to the agent.\n";
  }

  const lines: string[] = [`Triage verdicts (${verdicts.length}) — agent output before the policy gate:\n`];
  for (const v of verdicts) {
    lines.push(`${v.resourceFile}::${v.resourceIdentifier}`);
    lines.push(
      `  reachable: ${v.reachable}  recommended: ${v.recommendedAction}  confidence: ${v.confidence}`
    );
    lines.push(`  reasoning: ${v.reasoning}`);
    lines.push("");
  }
  return lines.join("\n");
}

// The interview proof: rows where deterministic policy, not the model, picked the action.
export function formatGateOverrides(decisions: PolicyDecision[]): string {
  const overrides = decisions.filter((d) => d.gateOverride != null);
  if (overrides.length === 0) {
    return "Policy overrides (0): no gate rule fired against an agent recommendation this run.\n";
  }

  const lines: string[] = [
    `Policy overrides (${overrides.length}) — deterministic gate, not the model:\n`,
  ];
  for (const d of overrides) {
    const override = d.gateOverride!;
    const from = override.from ?? "(no verdict)";
    const agreed = override.from != null && override.from === override.to;
    lines.push(`${d.resourceFile}::${d.resourceIdentifier}`);
    lines.push(`  triage: ${from} -> gate: ${override.to}${agreed ? "  (agent agreed; rule still does not consult it)" : ""}`);
    lines.push(`  rule: ${OVERRIDE_RULE_LABEL[override.rule]}`);
    lines.push("");
  }
  return lines.join("\n");
}
