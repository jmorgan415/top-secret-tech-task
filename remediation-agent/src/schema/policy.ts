import { z } from "zod";
import { FindingType } from "./finding.js";
import { RecommendedAction, TriageVerdict } from "./triage.js";

export const PolicyAction = z.enum(["auto-fix", "draft-for-review", "escalate", "no-action"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

export const GateOverrideRule = z.enum(["hardcoded-secret", "critical-no-autofix", "confidence-floor"]);
export type GateOverrideRule = z.infer<typeof GateOverrideRule>;

export const GateOverride = z.object({
  rule: GateOverrideRule,
  // What the agent recommended, if it saw this group. Absent when the secret path
  // fires with no verdict — the rule still applied; there was just nothing to compare.
  from: RecommendedAction.optional(),
  to: PolicyAction,
});
export type GateOverride = z.infer<typeof GateOverride>;

export const PolicyDecision = z.object({
  resourceFile: z.string(),
  resourceIdentifier: z.string(),
  findingIds: z.array(z.string()),
  // The finding type(s) this decision covers — carried through so verification can check
  // for a residual finding of the *same kind* on this resource after the fix, not just
  // any finding that happens to share its file+identifier.
  findingTypes: z.array(FindingType),
  action: PolicyAction,
  rationale: z.string(),
  triageVerdict: TriageVerdict.optional(),
  // Set when a deterministic gate rule decided the action instead of (or over) the agent.
  gateOverride: GateOverride.optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecision>;
