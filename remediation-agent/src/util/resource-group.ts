import type { Finding } from "../schema/finding.js";

export interface ResourceGroup {
  key: string;
  file: string;
  identifier: string;
  findings: Finding[];
}

export function groupByResource(findings: Finding[]): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();
  for (const finding of findings) {
    const key = `${finding.resource.file}::${finding.resource.identifier}`;
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(finding);
    } else {
      groups.set(key, {
        key,
        file: finding.resource.file,
        identifier: finding.resource.identifier,
        findings: [finding],
      });
    }
  }
  return [...groups.values()];
}
