import { execFileSync } from "node:child_process";
import { Agent } from "@cursor/sdk";
import type { PolicyDecision } from "../schema/policy.js";
import { FixResult, type FixResult as FixResultT } from "../schema/fix.js";

const FIXABLE_ACTIONS = new Set(["auto-fix", "draft-for-review"]);

export function isFixable(decision: PolicyDecision): boolean {
  return FIXABLE_ACTIONS.has(decision.action);
}

// The SDK restricts tool *types* (edit/shell/...), not which files an edit call may touch,
// so file scope is enforced here instead: declare up front what this decision is allowed
// to change, then verify the agent's actual diff against it after the run.
function allowedFilesFor(decision: PolicyDecision): string[] {
  return [decision.resourceFile];
}

function dirtyFiles(projectRoot: string): Set<string> {
  const output = execFileSync("git", ["status", "--porcelain"], { cwd: projectRoot, encoding: "utf8" });
  // Porcelain lines are a fixed-width "XY " status prefix (3 chars) then the path — e.g.
  // " M package.json" has a leading space that's part of the status, not incidental
  // whitespace, so the line must NOT be trimmed before slicing or the path shifts left.
  return new Set(
    output
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.slice(3).trim())
  );
}

function buildPrompt(decision: PolicyDecision): string {
  const context = decision.triageVerdict
    ? `Triage found this ${decision.triageVerdict.reachable ? "reachable" : "unreachable"}: ${decision.triageVerdict.reasoning}`
    : decision.rationale;

  if (decision.resourceFile === "Dockerfile") {
    return `Fix the end-of-life base image finding for "${decision.resourceIdentifier}" in Dockerfile.
${context}

Edit ONLY the FROM line in Dockerfile to a current, actively-maintained tag for the same image family. Do not touch any other file, and do not run any commands. Reply with one sentence describing exactly what you changed.`;
  }

  return `Fix the dependency finding for "${decision.resourceIdentifier}" in package.json.
${context}

Edit ONLY package.json: remove the "${decision.resourceIdentifier}" entry from "dependencies" if it's confirmed unused, or bump its version to the fixed version referenced in the finding if it's actively used. Do not edit package-lock.json and do not run any commands — lockfile regeneration and the build check happen in a separate verification step. Do not touch any file besides package.json. Reply with one sentence describing exactly what you changed.`;
}

export async function runFix(projectRoot: string, decision: PolicyDecision): Promise<FixResultT> {
  const allowed = new Set(allowedFilesFor(decision));
  const before = dirtyFiles(projectRoot);

  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: "composer-2.5" },
    // Edit access, but no shell: the agent proposes a source change; lockfile
    // regeneration and the rebuild/re-scan happen in the verification stage, not here.
    tools: ["read", "edit", "grep", "glob", "ls"],
    local: {
      cwd: projectRoot,
      sandboxOptions: { enabled: true },
    },
  });

  try {
    const run = await agent.send(buildPrompt(decision));
    const result = await run.wait();

    const after = dirtyFiles(projectRoot);
    const touched = [...after].filter((f) => !before.has(f));
    const outOfScope = touched.filter((f) => !allowed.has(f));

    if (outOfScope.length > 0) {
      // A partial, out-of-scope fix is worse than none — revert everything this run touched.
      execFileSync("git", ["checkout", "--", ...touched], { cwd: projectRoot });
      return FixResult.parse({
        resourceFile: decision.resourceFile,
        resourceIdentifier: decision.resourceIdentifier,
        action: decision.action,
        outcome: "rejected",
        changedFiles: [],
        summary: result.result ?? "",
        rejectionReason: `agent touched out-of-scope file(s): ${outOfScope.join(", ")}`,
      });
    }

    if (result.status !== "finished") {
      if (touched.length > 0) execFileSync("git", ["checkout", "--", ...touched], { cwd: projectRoot });
      return FixResult.parse({
        resourceFile: decision.resourceFile,
        resourceIdentifier: decision.resourceIdentifier,
        action: decision.action,
        outcome: "error",
        changedFiles: [],
        summary: result.error?.message ?? `run ended with status ${result.status}`,
      });
    }

    if (touched.length === 0) {
      return FixResult.parse({
        resourceFile: decision.resourceFile,
        resourceIdentifier: decision.resourceIdentifier,
        action: decision.action,
        outcome: "rejected",
        changedFiles: [],
        summary: result.result ?? "",
        rejectionReason: "agent made no file changes",
      });
    }

    return FixResult.parse({
      resourceFile: decision.resourceFile,
      resourceIdentifier: decision.resourceIdentifier,
      action: decision.action,
      outcome: "applied",
      changedFiles: touched,
      summary: result.result ?? "",
    });
  } finally {
    agent.close();
  }
}
