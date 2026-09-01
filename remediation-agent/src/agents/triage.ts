import { Agent } from "@cursor/sdk";
import type { Finding } from "../schema/finding.js";
import { TriageVerdictBatch, type TriageVerdict } from "../schema/triage.js";
import { groupByResource, type ResourceGroup } from "../util/resource-group.js";

const TRIAGE_WORTHY_SEVERITIES = new Set(["high", "critical"]);

// Low/medium findings skip the (slower, metered) agent call entirely and fall through
// to a deterministic "draft-for-review" default further down the pipeline — the agent
// is reserved for the judgment calls a grep can't make: is this actually reachable, and
// does how it's used actually hit the vulnerable code path.
export function selectTriageCandidates(findings: Finding[]): ResourceGroup[] {
  return groupByResource(findings).filter((group) =>
    group.findings.some((f) => TRIAGE_WORTHY_SEVERITIES.has(f.severity))
  );
}

function buildPrompt(candidates: ResourceGroup[]): string {
  const payload = candidates.map((group) => ({
    resourceFile: group.file,
    resourceIdentifier: group.identifier,
    findingIds: group.findings.map((f) => f.id),
    findings: group.findings.map((f) => ({
      type: f.type,
      severity: f.severity,
      title: f.title,
      description: f.description,
      evidence: f.evidence,
    })),
  }));

  return `You are a security triage agent for this repository. Below is a list of findings, grouped by the resource (dependency or base image) they came from. Findings were produced by static scanners — treat their claims as leads to verify, not facts.

${JSON.stringify(payload, null, 2)}

For each resource, use your read/grep/glob tools to independently check this repo:
1. Reachability — is this package/image actually used by the app's own code (src/, Dockerfile, manifests), not just present in a lockfile or node_modules? Don't trust the finding's "direct" flag; verify it yourself.
2. Exploitability — if reachable, is the specific vulnerable behavior described in the finding (e.g. a named function from an advisory) actually invoked anywhere in this repo's source, or is the package present but that code path never called?
3. Classification — assign exactly one of:
   - "auto-fix": confirmed unreachable/dead, or a patch-level version bump with no source-level impact.
   - "draft-for-review": reachable and actively relied on (e.g. required for the build to run), so a human should confirm the fix before it merges.
   - "escalate": high/critical severity AND reachable AND you found a concrete path to the vulnerable behavior in this repo's own source.

Respond with ONLY a JSON array, no prose and no markdown code fences, matching exactly this shape:
[{"resourceFile": string, "resourceIdentifier": string, "findingIds": string[], "reachable": boolean, "recommendedAction": "auto-fix" | "draft-for-review" | "escalate", "confidence": number between 0 and 1, "reasoning": string}]`;
}

function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

export async function runTriage(projectRoot: string, findings: Finding[]): Promise<TriageVerdict[]> {
  const candidates = selectTriageCandidates(findings);
  if (candidates.length === 0) return [];

  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: "composer-2.5" },
    // Read-only allowlist: the triage agent inspects the repo, it never edits it.
    // sandboxOptions additionally denies network access by default, so this step
    // can't reach out to anything even if a prompt tried to make it.
    tools: ["read", "grep", "glob", "ls"],
    local: {
      cwd: projectRoot,
      sandboxOptions: { enabled: true },
    },
  });

  try {
    const run = await agent.send(buildPrompt(candidates));
    const result = await run.wait();

    if (result.status !== "finished" || !result.result) {
      throw new Error(
        `Triage run did not finish cleanly: status=${result.status} error=${result.error?.message ?? "none"}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonArray(result.result));
    } catch (err) {
      throw new Error(
        `Triage agent did not return parseable JSON: ${(err as Error).message}\n---\n${result.result}`
      );
    }

    return TriageVerdictBatch.parse(parsed);
  } finally {
    agent.close();
  }
}
