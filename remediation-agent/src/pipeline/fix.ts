import { execFileSync } from "node:child_process";
import { isFixable, runFix } from "../agents/fix.js";
import type { FixResult } from "../schema/fix.js";
import type { PolicyDecision } from "../schema/policy.js";
import type { VerificationResult } from "../schema/verification.js";
import { verifyFix } from "./verify.js";

function git(projectRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

export interface RemediationOutcome {
  decision: PolicyDecision;
  fix: FixResult;
  verification: VerificationResult;
}

export interface FixPipelineResult {
  branch: string;
  outcomes: RemediationOutcome[];
}

// Fix and verify run one resource at a time — commit, then immediately verify that
// commit — rather than applying every fix first and verifying afterward. A failed
// verification reverts by commit sha, and that only stays a plain (non-conflicting)
// revert as long as the commit being reverted is still the branch tip; batching
// verification to the end let an earlier fix's revert collide with a later fix that
// touched the same file (multiple dependency removals all editing package.json).
export async function runFixPipeline(projectRoot: string, decisions: PolicyDecision[]): Promise<FixPipelineResult> {
  if (git(projectRoot, ["status", "--porcelain"])) {
    throw new Error("Working tree is not clean — commit or stash changes before running the fix pipeline.");
  }

  const branch = `remediation/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  git(projectRoot, ["checkout", "-b", branch]);

  const outcomes: RemediationOutcome[] = [];
  for (const decision of decisions.filter(isFixable)) {
    const fix = await runFix(projectRoot, decision);

    if (fix.outcome === "applied") {
      git(projectRoot, ["add", ...fix.changedFiles]);
      git(projectRoot, ["commit", "-m", `[${decision.action}] ${decision.resourceIdentifier}: ${fix.summary}`]);
      fix.commitSha = git(projectRoot, ["rev-parse", "HEAD"]);
    }

    const verification = await verifyFix(projectRoot, decision, fix);
    outcomes.push({ decision, fix, verification });
  }

  return { branch, outcomes };
}
