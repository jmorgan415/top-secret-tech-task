import { z } from "zod";
import { PolicyAction } from "./policy.js";

export const FixOutcome = z.enum(["applied", "rejected", "error"]);
export type FixOutcome = z.infer<typeof FixOutcome>;

export const FixResult = z.object({
  resourceFile: z.string(),
  resourceIdentifier: z.string(),
  action: PolicyAction,
  outcome: FixOutcome,
  changedFiles: z.array(z.string()),
  summary: z.string(),
  rejectionReason: z.string().optional(),
  commitSha: z.string().optional(),
});
export type FixResult = z.infer<typeof FixResult>;
