import { z } from "zod";

export const VerificationOutcome = z.enum(["verified", "failed", "skipped"]);
export type VerificationOutcome = z.infer<typeof VerificationOutcome>;

export const VerificationResult = z.object({
  resourceFile: z.string(),
  resourceIdentifier: z.string(),
  outcome: VerificationOutcome,
  details: z.string(),
});
export type VerificationResult = z.infer<typeof VerificationResult>;
