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
    const verdict = verdictByResource.get(group.key);

    if (verdict) {
      const hasCritical = group.findings.some((f) => f.severity === "critical");
      let action = verdict.recommendedAction;
      let rationale = `triage: ${verdict.reasoning}`;

      if (action === "auto-fix" && hasCritical) {
        action = "draft-for-review";
        rationale += " [downgraded: a critical-severity finding never auto-applies]";
      } else if (action === "auto-fix" && verdict.confidence < CONFIDENCE_FLOOR) {
        action = "draft-for-review";
        rationale += ` [downgraded: triage confidence ${verdict.confidence} is below the ${CONFIDENCE_FLOOR} floor]`;
      }

      return PolicyDecision.parse({
        resourceFile: group.file,
        resourceIdentifier: group.identifier,
        findingIds,
        action,
        rationale,
        triageVerdict: verdict,
      });
    }

    // No triage verdict means nothing in this group was high/critical severity, so it never
    // reached the agent. The dependency-hygiene adapter's "unused" check is itself a
    // deterministic, source-wide reachability proof, so those can auto-fix without spending
    // an agent call to re-confirm what a grep already settled.
    const isUnusedOnly = group.findings.every((f) => f.type === "unused-dependency");
    if (isUnusedOnly) {
      return PolicyDecision.parse({
        resourceFile: group.file,
        resourceIdentifier: group.identifier,
        findingIds,
        action: "auto-fix",
        rationale: "no import/require found by the static hygiene scan and no co-located finding was severe enough to warrant agent triage",
      });
    }

    return PolicyDecision.parse({
      resourceFile: group.file,
      resourceIdentifier: group.identifier,
      findingIds,
      action: "no-action",
      rationale: "below the severity threshold for triage, or only reachable via a transitive dependency chain this pass doesn't remediate directly",
    });
  });
}
