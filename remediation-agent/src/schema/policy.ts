import { z } from "zod";
import { FindingType } from "./finding.js";
import { TriageVerdict } from "./triage.js";

export const PolicyAction = z.enum(["auto-fix", "draft-for-review", "escalate", "no-action"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

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
});
export type PolicyDecision = z.infer<typeof PolicyDecision>;
