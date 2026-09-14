import type { Approval, ExecutionPlan } from "./domain.js";

export type GateDecision = { allowed: true } | { allowed: false; reasons: string[] };

export function evaluatePlanGate(plan: ExecutionPlan, approval?: Approval, now = new Date()): GateDecision {
  const reasons = [...plan.blockedReasons];
  if (reasons.length > 0) return { allowed: false, reasons };
  if (plan.requiredApproval === "none") return { allowed: true };
  if (!approval) return { allowed: false, reasons: ["缺少与当前计划绑定的审批"] };
  if (approval.planHash !== plan.planHash) reasons.push("审批 planHash 与当前计划不一致");
  if (approval.state !== "approved") reasons.push(`审批状态不可用：${approval.state}`);
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) reasons.push("审批已过期");
  for (const actionId of plan.actionIds) if (!approval.actionIds.includes(actionId)) reasons.push(`审批未覆盖动作：${actionId}`);
  for (const targetId of plan.targetIds) if (!approval.targetIds.includes(targetId)) reasons.push(`审批未覆盖目标：${targetId}`);
  return reasons.length > 0 ? { allowed: false, reasons } : { allowed: true };
}
