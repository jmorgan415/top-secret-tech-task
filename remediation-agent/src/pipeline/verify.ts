import { execFileSync } from "node:child_process";
import type { FixResult } from "../schema/fix.js";
import type { PolicyDecision } from "../schema/policy.js";
import { VerificationResult, type VerificationResult as VerificationResultT } from "../schema/verification.js";
import { runAllScanners } from "./scan.js";

function git(projectRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

function tryRun(cmd: string, args: string[], cwd: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, { cwd, encoding: "utf8" });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return { ok: false, output: e.stderr ?? e.stdout ?? e.message };
  }
}

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Matches on (file, identifier, type) rather than just (file, identifier): a fix can
// legitimately change what the resource looks like without eliminating it from a
// re-scan entirely (e.g. removing a direct dependency doesn't remove a transitive copy
// other packages still pull in — that's a different, unaddressed finding, not this one
// still failing). Restricting to the original finding's own type(s) is what tells those
// apart instead of treating any residual hit on the resource as this fix having failed.
function findingStillPresent(projectRoot: string, decision: PolicyDecision): boolean {
  const types = new Set(decision.findingTypes);
  return runAllScanners(projectRoot).some(
    (f) =>
      f.resource.file === decision.resourceFile &&
      f.resource.identifier === decision.resourceIdentifier &&
      types.has(f.type)
  );
}

function revert(projectRoot: string, commitSha: string | undefined) {
  if (commitSha) git(projectRoot, ["revert", "--no-edit", commitSha]);
}

function failed(decision: PolicyDecision, projectRoot: string, commitSha: string | undefined, details: string): VerificationResultT {
  revert(projectRoot, commitSha);
  return VerificationResult.parse({
    resourceFile: decision.resourceFile,
    resourceIdentifier: decision.resourceIdentifier,
    outcome: "failed",
    details,
  });
}

// Rebuild and re-scan on the branch, not just re-read the diff — a syntactically fine
// patch can still break the build or leave the underlying vulnerability in place. Must
// run immediately after this decision's own commit (before any later decision commits),
// since a failure here reverts by commit sha — reverting a commit that isn't the branch
// tip risks conflicting with whatever was committed on top of it afterward.
export async function verifyFix(projectRoot: string, decision: PolicyDecision, fix: FixResult): Promise<VerificationResultT> {
  if (fix.outcome !== "applied") {
    return VerificationResult.parse({
      resourceFile: decision.resourceFile,
      resourceIdentifier: decision.resourceIdentifier,
      outcome: "skipped",
      details: "fix was not applied",
    });
  }

  if (decision.resourceFile === "Dockerfile") {
    if (!dockerAvailable()) {
      return VerificationResult.parse({
        resourceFile: decision.resourceFile,
        resourceIdentifier: decision.resourceIdentifier,
        outcome: "skipped",
        details: "docker is not available locally; skipping build verification",
      });
    }
    const build = tryRun("docker", ["build", "-t", "remediation-verify:tmp", "."], projectRoot);
    if (!build.ok) {
      return failed(decision, projectRoot, fix.commitSha, `docker build failed, reverted: ${build.output.slice(0, 500)}`);
    }
  } else {
    const install = tryRun("npm", ["install"], projectRoot);
    if (!install.ok) {
      return failed(decision, projectRoot, fix.commitSha, `npm install failed, reverted: ${install.output.slice(0, 500)}`);
    }

    const build = tryRun("npm", ["run", "build"], projectRoot);
    if (!build.ok) {
      return failed(decision, projectRoot, fix.commitSha, `npm run build failed, reverted: ${build.output.slice(0, 500)}`);
    }
  }

  if (findingStillPresent(projectRoot, decision)) {
    return failed(decision, projectRoot, fix.commitSha, "a finding of the same type is still present on this resource after re-scan, reverted");
  }

  return VerificationResult.parse({
    resourceFile: decision.resourceFile,
    resourceIdentifier: decision.resourceIdentifier,
    outcome: "verified",
    details: "rebuild succeeded and the finding no longer appears in a fresh scan",
  });
}
