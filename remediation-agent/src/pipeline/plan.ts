import { runAllScanners } from "./scan.js";
import { runTriage } from "../agents/triage.js";
import { applyPolicyGate } from "../policy/gate.js";
import type { Finding } from "../schema/finding.js";
import type { PolicyDecision } from "../schema/policy.js";
import type { TriageVerdict } from "../schema/triage.js";

export interface RemediationPlan {
  findings: Finding[];
  verdicts: TriageVerdict[];
  decisions: PolicyDecision[];
}

export async function buildPlan(projectRoot: string): Promise<RemediationPlan> {
  const findings = runAllScanners(projectRoot);
  const verdicts = await runTriage(projectRoot, findings);
  const decisions = applyPolicyGate(findings, verdicts);
  return { findings, verdicts, decisions };
}
