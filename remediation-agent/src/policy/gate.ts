import type { Finding } from "../schema/finding.js";
import { PolicyDecision, type PolicyDecision as PolicyDecisionT } from "../schema/policy.js";
import type { TriageVerdict } from "../schema/triage.js";
import { groupByResource } from "../util/resource-group.js";

// Below this, an "auto-fix" verdict gets downgraded rather than trusted outright.
const CONFIDENCE_FLOOR = 0.6;

// This is the one place recommendations become actions, and it runs as plain code, not
// a model call — the triage agent's verdict is an input to it, never the final word.
// Two hard rules apply regardless of what the agent said or how confident it was:
// a critical-severity finding never auto-applies, and a low-confidence verdict gets
// downgraded a step rather than acted on.
export function applyPolicyGate(findings: Finding[], verdicts: TriageVerdict[]): PolicyDecisionT[] {
  const verdictByResource = new Map(verdicts.map((v) => [`${v.resourceFile}::${v.resourceIdentifier}`, v]));

  return groupByResource(findings).map((group) => {
    const findingIds = group.findings.map((f) => f.id);
    const findingTypes = [...new Set(group.findings.map((f) => f.type))];
    const verdict = verdictByResource.get(group.key);

    // A hardcoded secret always escalates to a human — no triage verdict, confidence
    // score, or severity check gets a vote, and this is checked before anything else.
    // The actual fix for a leaked credential is rotating it, which this pipeline can't
    // do, so the only correct automated action is making sure a person sees it.
    if (group.findings.some((f) => f.type === "hardcoded-secret")) {
      return PolicyDecision.parse({
        resourceFile: group.file,
        resourceIdentifier: group.identifier,
        findingIds,
        findingTypes,
        action: "escalate",
        rationale: verdict
          ? `triage: ${verdict.reasoning} [overridden: hardcoded secrets always escalate, regardless of triage recommendation]`
          : "hardcoded secret detected; always escalates regardless of triage",
        triageVerdict: verdict,
        gateOverride: {
          rule: "hardcoded-secret",
          from: verdict?.recommendedAction,
          to: "escalate",
        },
      });
    }

    if (verdict) {
      const hasCritical = group.findings.some((f) => f.severity === "critical");
      let action = verdict.recommendedAction;
      let rationale = `triage: ${verdict.reasoning}`;
      let gateOverride: PolicyDecisionT["gateOverride"];

      if (action === "auto-fix" && hasCritical) {
        action = "draft-for-review";
        rationale += " [downgraded: a critical-severity finding never auto-applies]";
        gateOverride = { rule: "critical-no-autofix", from: verdict.recommendedAction, to: action };
      } else if (action === "auto-fix" && verdict.confidence < CONFIDENCE_FLOOR) {
        action = "draft-for-review";
        rationale += ` [downgraded: triage confidence ${verdict.confidence} is below the ${CONFIDENCE_FLOOR} floor]`;
        gateOverride = { rule: "confidence-floor", from: verdict.recommendedAction, to: action };
      }

      return PolicyDecision.parse({
        resourceFile: group.file,
        resourceIdentifier: group.identifier,
        findingIds,
        findingTypes,
        action,
        rationale,
        triageVerdict: verdict,
        ...(gateOverride ? { gateOverride } : {}),
      });
    }

    // No triage verdict means the group never reached the agent: below high/critical,
    // or a high/critical finding that is not addressable (devDependency / transitive).
    // Unused-only production deps still auto-fix — the hygiene scan is itself a
    // source-wide reachability proof, so we don't spend an agent call to re-confirm it.
    const isUnusedOnly = group.findings.every((f) => f.type === "unused-dependency");
    if (isUnusedOnly) {
      return PolicyDecision.parse({
        resourceFile: group.file,
        resourceIdentifier: group.identifier,
        findingIds,
        findingTypes,
        action: "auto-fix",
        rationale: "no import/require found by the static hygiene scan and no co-located finding was severe enough to warrant agent triage",
      });
    }

    return PolicyDecision.parse({
      resourceFile: group.file,
      resourceIdentifier: group.identifier,
      findingIds,
      findingTypes,
      action: "no-action",
      rationale: "not in scope for this pass: below triage severity, a devDependency/build-tool CVE, or a transitive-only advisory this pipeline does not remediate directly",
    });
  });
}

export function selectOverrides(decisions: PolicyDecisionT[]): PolicyDecisionT[] {
  return decisions.filter((d) => d.gateOverride != null);
}
