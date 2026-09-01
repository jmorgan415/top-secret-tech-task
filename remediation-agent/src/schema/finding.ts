import { z } from "zod";

export const Severity = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof Severity>;

// New finding types get added here as new adapters come online
// (dependency-hygiene -> "unused-dependency", dockerfile-lint -> "eol-base-image", ...).
export const FindingType = z.enum([
  "dependency-vulnerability",
  "unused-dependency",
  "eol-base-image",
]);
export type FindingType = z.infer<typeof FindingType>;

export const FindingSource = z.enum([
  "npm-audit",
  "dependency-hygiene",
  "dockerfile-lint",
  "manual",
]);
export type FindingSource = z.infer<typeof FindingSource>;

export const Resource = z.object({
  file: z.string(),
  identifier: z.string(),
  line: z.number().int().positive().optional(),
});
export type Resource = z.infer<typeof Resource>;

export const Advisory = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url().optional(),
  cvss: z.number().min(0).max(10).optional(),
});
export type Advisory = z.infer<typeof Advisory>;

export const Evidence = z.object({
  currentVersion: z.string().optional(),
  fixedVersion: z.string().optional(),
  direct: z.boolean().optional(),
  advisories: z.array(Advisory).default([]),
  // Original scanner payload, kept verbatim for the audit trail / debugging normalization bugs.
  raw: z.unknown().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Finding = z.object({
  id: z.string(),
  source: FindingSource,
  type: FindingType,
  severity: Severity,
  title: z.string(),
  description: z.string(),
  resource: Resource,
  evidence: Evidence,
  detectedAt: z.string().datetime(),
});
export type Finding = z.infer<typeof Finding>;

// Deterministic so re-running a scan produces the same id for the same underlying issue,
// which is what lets the pipeline dedupe across runs instead of opening duplicate fixes.
export function makeFindingId(
  source: FindingSource,
  type: FindingType,
  resource: Pick<Resource, "file" | "identifier">
): string {
  return `${source}:${type}:${resource.file}:${resource.identifier}`;
}
