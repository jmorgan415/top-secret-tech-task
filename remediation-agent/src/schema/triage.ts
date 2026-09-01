import { z } from "zod";

export const RecommendedAction = z.enum(["auto-fix", "draft-for-review", "escalate"]);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const TriageVerdict = z.object({
  resourceFile: z.string(),
  resourceIdentifier: z.string(),
  findingIds: z.array(z.string()),
  reachable: z.boolean(),
  recommendedAction: RecommendedAction,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type TriageVerdict = z.infer<typeof TriageVerdict>;

export const TriageVerdictBatch = z.array(TriageVerdict);
