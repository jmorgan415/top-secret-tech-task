import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { Finding, makeFindingId } from "../schema/finding.js";
import { walkFiles } from "../util/walk-files.js";

const SOURCE_EXTENSIONS = new Set([".js", ".vue", ".ts", ".jsx", ".tsx"]);

interface SecretRule {
  name: string;
  pattern: RegExp;
}

// Two of the most common shapes real secret scanners look for: a recognizable
// cloud-provider key format, and a generic "assigned to something secret-shaped"
// catch-all. Not exhaustive — a real tool carries hundreds of provider-specific
// patterns; this is enough to demonstrate the finding type and the escalate-only
// policy path it forces.
const RULES: SecretRule[] = [
  { name: "AWS Access Key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "hardcoded credential-shaped assignment",
    pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']([A-Za-z0-9_\-]{16,})["']/i,
  },
];

// Never store or print the full matched value, including in evidence.raw — this is
// data that flows into console output, the triage agent's prompt, and eventually a
// real LLM API call. A real secret has no business appearing in full in any of those
// places; redacting here means that stays true even if this pattern set later matches
// something that isn't a placeholder.
function redact(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

export function scanSecrets(projectRoot: string, sourceDirs: string[] = ["src"]): Finding[] {
  const files = sourceDirs.flatMap((dir) => walkFiles(`${projectRoot}/${dir}`, SOURCE_EXTENSIONS));

  const findings: Finding[] = [];
  for (const file of files) {
    const relPath = relative(projectRoot, file);
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((lineText, idx) => {
      for (const rule of RULES) {
        const match = lineText.match(rule.pattern);
        if (!match) continue;

        const redacted = redact(match[0]);
        const resource = { file: relPath, identifier: `${rule.name} (${redacted})`, line: idx + 1 };

        findings.push(
          Finding.parse({
            id: makeFindingId("secret-scanning", "hardcoded-secret", resource),
            source: "secret-scanning",
            type: "hardcoded-secret",
            // Critical regardless of whether the surrounding code ever runs — the
            // exposure already happened the moment this was committed to git.
            severity: "critical",
            title: `${rule.name} hardcoded in source`,
            description: `Matched at ${relPath}:${idx + 1}. Secrets committed to source control remain exposed in git history even after being deleted from HEAD; the only real fix is rotating the credential, not editing the file.`,
            resource,
            evidence: { advisories: [] },
            detectedAt: new Date().toISOString(),
          })
        );
      }
    });
  }
  return findings;
}
