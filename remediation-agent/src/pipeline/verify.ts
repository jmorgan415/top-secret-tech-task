import { execFileSync } from "node:child_process";
import type { FixResult } from "../schema/fix.js";
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

function findingStillPresent(projectRoot: string, result: FixResult): boolean {
  return runAllScanners(projectRoot).some(
    (f) => f.resource.file === result.resourceFile && f.resource.identifier === result.resourceIdentifier
  );
}

function revert(projectRoot: string, commitSha: string | undefined) {
  if (commitSha) git(projectRoot, ["revert", "--no-edit", commitSha]);
}

function failed(result: FixResult, projectRoot: string, details: string): VerificationResultT {
  revert(projectRoot, result.commitSha);
  return VerificationResult.parse({
    resourceFile: result.resourceFile,
    resourceIdentifier: result.resourceIdentifier,
    outcome: "failed",
    details,
  });
}

// Rebuild and re-scan on the branch, not just re-read the diff — a syntactically fine
// patch can still break the build or leave the underlying vulnerability in place. Any
// failure here reverts the fix's commit rather than leaving a broken or unverified
// change sitting on the branch.
export async function verifyFix(projectRoot: string, result: FixResult): Promise<VerificationResultT> {
  if (result.outcome !== "applied") {
    return VerificationResult.parse({
      resourceFile: result.resourceFile,
      resourceIdentifier: result.resourceIdentifier,
      outcome: "skipped",
      details: "fix was not applied",
    });
  }

  if (result.resourceFile === "Dockerfile") {
    if (!dockerAvailable()) {
      return VerificationResult.parse({
        resourceFile: result.resourceFile,
        resourceIdentifier: result.resourceIdentifier,
        outcome: "skipped",
        details: "docker is not available locally; skipping build verification",
      });
    }
    const build = tryRun("docker", ["build", "-t", "remediation-verify:tmp", "."], projectRoot);
    if (!build.ok) return failed(result, projectRoot, `docker build failed, reverted: ${build.output.slice(0, 500)}`);
  } else {
    const install = tryRun("npm", ["install"], projectRoot);
    if (!install.ok) return failed(result, projectRoot, `npm install failed, reverted: ${install.output.slice(0, 500)}`);

    const build = tryRun("npm", ["run", "build"], projectRoot);
    if (!build.ok) return failed(result, projectRoot, `npm run build failed, reverted: ${build.output.slice(0, 500)}`);
  }

  if (findingStillPresent(projectRoot, result)) {
    return failed(result, projectRoot, "finding still present after re-scan, reverted");
  }

  return VerificationResult.parse({
    resourceFile: result.resourceFile,
    resourceIdentifier: result.resourceIdentifier,
    outcome: "verified",
    details: "rebuild succeeded and the finding no longer appears in a fresh scan",
  });
}

export async function runVerification(projectRoot: string, fixResults: FixResult[]): Promise<VerificationResultT[]> {
  const verifications: VerificationResultT[] = [];
  for (const result of fixResults) {
    verifications.push(await verifyFix(projectRoot, result));
  }
  return verifications;
}
