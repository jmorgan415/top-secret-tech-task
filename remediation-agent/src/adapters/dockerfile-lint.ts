import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Finding, makeFindingId } from "../schema/finding.js";

interface BaseImageRule {
  repo: string; // matches the image name before ":", e.g. "node"
  // Policy knob, not a fact: the minimum version we're willing to call "supported."
  // Move this as upstream LTS/EOL schedules move.
  minSupportedVersion: number[];
  recommendedTag: string;
  advisoryNote: string;
}

const RULES: BaseImageRule[] = [
  {
    repo: "node",
    minSupportedVersion: [22],
    recommendedTag: "node:22-alpine",
    advisoryNote: "Node.js releases below the current Active LTS line no longer receive security patches.",
  },
  {
    repo: "python",
    minSupportedVersion: [3, 11],
    recommendedTag: "python:3.12-slim",
    advisoryNote: "Python releases below 3.11 are past or approaching end-of-life.",
  },
];

function parseVersion(tag: string): number[] {
  const match = tag.match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return [];
  return match[2] !== undefined ? [Number(match[1]), Number(match[2])] : [Number(match[1])];
}

// True if `version` is strictly below `min`, comparing component by component
// (so [3, 9] is below [3, 11], but [3, 12] is not).
function isBelowMinimum(version: number[], min: number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    const v = version[i] ?? 0;
    if (v < min[i]) return true;
    if (v > min[i]) return false;
  }
  return false;
}

function parseFromLines(dockerfile: string): { line: number; image: string }[] {
  const results: { line: number; image: string }[] = [];
  dockerfile.split("\n").forEach((text, idx) => {
    const match = text.match(/^\s*FROM\s+(\S+)/i);
    if (match) results.push({ line: idx + 1, image: match[1] });
  });
  return results;
}

export function scanDockerfileLint(projectRoot: string, dockerfilePaths: string[] = ["Dockerfile"]): Finding[] {
  const findings: Finding[] = [];

  for (const relPath of dockerfilePaths) {
    let contents: string;
    try {
      contents = readFileSync(join(projectRoot, relPath), "utf8");
    } catch {
      continue;
    }

    for (const { line, image } of parseFromLines(contents)) {
      const [repoPart, tag] = image.split(":");
      if (!tag) continue; // untagged FROM (e.g. `FROM builder` referencing an earlier stage)

      const repo = repoPart.split("/").pop()!;
      const rule = RULES.find((r) => r.repo === repo);
      if (!rule) continue;

      const version = parseVersion(tag);
      if (version.length === 0 || !isBelowMinimum(version, rule.minSupportedVersion)) continue;

      const resource = { file: relPath, identifier: image, line };
      findings.push(
        Finding.parse({
          id: makeFindingId("dockerfile-lint", "eol-base-image", resource),
          source: "dockerfile-lint",
          type: "eol-base-image",
          severity: "high",
          title: `${image} is an end-of-life base image`,
          description: rule.advisoryNote,
          resource,
          evidence: {
            currentVersion: tag,
            fixedVersion: rule.recommendedTag.split(":")[1],
            advisories: [],
          },
          detectedAt: new Date().toISOString(),
        })
      );
    }
  }

  return findings;
}
