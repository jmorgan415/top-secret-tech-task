import { execFileSync } from "node:child_process";
import { isFixable, runFix } from "../agents/fix.js";
import type { FixResult } from "../schema/fix.js";
import type { PolicyDecision } from "../schema/policy.js";

function git(projectRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

export interface FixPipelineResult {
  branch: string;
  results: FixResult[];
}

// Fixes run one at a time and each applied fix is committed immediately, so the next
// fix's before/after diff (in runFix) starts from a clean baseline even when two
// decisions touch the same file — e.g. three separate dependency removals all editing
// package.json. Never runs against a dirty tree: that would make the very first diff
// unattributable, and reverting an out-of-scope touch could destroy real uncommitted work.
export async function runFixPipeline(projectRoot: string, decisions: PolicyDecision[]): Promise<FixPipelineResult> {
  if (git(projectRoot, ["status", "--porcelain"])) {
    throw new Error("Working tree is not clean — commit or stash changes before running the fix pipeline.");
  }

  const branch = `remediation/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  git(projectRoot, ["checkout", "-b", branch]);

  const results: FixResult[] = [];
  for (const decision of decisions.filter(isFixable)) {
    const result = await runFix(projectRoot, decision);
    results.push(result);

    if (result.outcome === "applied") {
      git(projectRoot, ["add", ...result.changedFiles]);
      git(projectRoot, ["commit", "-m", `[${decision.action}] ${decision.resourceIdentifier}: ${result.summary}`]);
      result.commitSha = git(projectRoot, ["rev-parse", "HEAD"]);
    }
  }

  return { branch, results };
}
