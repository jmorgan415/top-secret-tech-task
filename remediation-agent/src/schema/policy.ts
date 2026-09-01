import { z } from "zod";
import { TriageVerdict } from "./triage.js";

export const PolicyAction = z.enum(["auto-fix", "draft-for-review", "escalate", "no-action"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

export const PolicyDecision = z.object({
  resourceFile: z.string(),
  resourceIdentifier: z.string(),
  findingIds: z.array(z.string()),
  action: PolicyAction,
  rationale: z.string(),
  triageVerdict: TriageVerdict.optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecision>;
