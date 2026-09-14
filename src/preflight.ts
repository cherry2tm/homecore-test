export interface PreflightInput {
  requiredCapabilities: string[];
  availableCapabilities: string[];
  requiredEvidence: string[];
  availableEvidence: string[];
  deviceId?: string;
  firmwareIdentity?: string;
  leaseId?: string;
  leaseActive: boolean;
}

export interface PreflightResult {
  status: "READY" | "BLOCKED";
  reasons: string[];
}

export function runHardwarePreflight(input: PreflightInput): PreflightResult {
  const reasons: string[] = [];
  const availableCapabilities = new Set(input.availableCapabilities);
  const availableEvidence = new Set(input.availableEvidence);
  const missingCapabilities = input.requiredCapabilities.filter((item) => !availableCapabilities.has(item));
  const missingEvidence = input.requiredEvidence.filter((item) => !availableEvidence.has(item));
  if (missingCapabilities.length > 0) reasons.push(`缺少环境能力：${missingCapabilities.join(", ")}`);
  if (missingEvidence.length > 0) reasons.push(`缺少证据采集能力：${missingEvidence.join(", ")}`);
  if (!input.deviceId) reasons.push("未绑定设备身份");
  if (!input.firmwareIdentity) reasons.push("未记录固件身份");
  if (!input.leaseId || !input.leaseActive) reasons.push("缺少有效资源租约");
  return reasons.length > 0 ? { status: "BLOCKED", reasons } : { status: "READY", reasons: [] };
}
