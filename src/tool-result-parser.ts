import type { Verdict } from "./domain.js";

export interface ToolParseSpec {
  successMarker?: string;
  failureMarker?: string;
  json?: boolean;
  jsonSuccessField?: string;
}

export interface ParsedToolResult {
  verdict: Verdict;
  assertions: Array<{ id: string; status: "PASS" | "FAIL"; expected: string; actual: string; evidenceIds: string[] }>;
  reason?: string;
}

export function parseToolResult(output: string, exitCode: number | null, evidenceId: string, spec: ToolParseSpec): ParsedToolResult {
  if (exitCode === null) return { verdict: "BLOCKED", assertions: [], reason: "工具未返回退出码" };
  if (spec.json) {
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const field = spec.jsonSuccessField ?? "passed";
      const value = parsed[field];
      if (typeof value !== "boolean") return { verdict: "BLOCKED", assertions: [], reason: `JSON 缺少布尔字段：${field}` };
      const status = value ? "PASS" : "FAIL";
      return { verdict: status, assertions: [{ id: "tool-json-result", status, expected: "true", actual: String(value), evidenceIds: [evidenceId] }] };
    } catch { return { verdict: "BLOCKED", assertions: [], reason: "工具输出不是合法 JSON" }; }
  }
  if (spec.failureMarker && output.includes(spec.failureMarker)) return { verdict: "FAIL", assertions: [{ id: "tool-failure-marker", status: "FAIL", expected: spec.successMarker ?? "no failure marker", actual: spec.failureMarker, evidenceIds: [evidenceId] }] };
  if (spec.successMarker && output.includes(spec.successMarker)) return { verdict: "PASS", assertions: [{ id: "tool-success-marker", status: "PASS", expected: spec.successMarker, actual: spec.successMarker, evidenceIds: [evidenceId] }] };
  return { verdict: "BLOCKED", assertions: [], reason: "无法从工具输出解析确定性结论" };
}
