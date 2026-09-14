import { prepareCommand, type ArgValue, type CommandDefinition } from "./command-dispatch.js";
import { runPreparedCommand, type ProcessResult } from "./worker-runner.js";
import type { LeaseManager } from "./lease.js";

export interface ExecutorResult extends ProcessResult {
  commandId: string;
  executionStatus: "completed" | "timeout" | "tool-error";
}

export async function executeRegisteredCommand(registry: ReadonlyArray<CommandDefinition>, commandId: string, values: Record<string, ArgValue>, timeoutMs: number): Promise<ExecutorResult> {
  const prepared = prepareCommand(registry, commandId, values);
  try {
    const result = await runPreparedCommand(prepared, timeoutMs);
    return { ...result, commandId, executionStatus: result.timedOut ? "timeout" : "completed" };
  } catch (error) {
    return { commandId, exitCode: null, signal: null, stdout: "", stderr: error instanceof Error ? error.message : String(error), timedOut: false, executionStatus: "tool-error" };
  }
}

export async function executeWithLease(manager: LeaseManager, leaseId: string, fencingToken: number, registry: ReadonlyArray<CommandDefinition>, commandId: string, values: Record<string, ArgValue>, timeoutMs: number): Promise<ExecutorResult> {
  try {
    manager.renew(leaseId, fencingToken, timeoutMs + 1000);
  } catch (error) {
    return { commandId, exitCode: null, signal: null, stdout: "", stderr: error instanceof Error ? error.message : String(error), timedOut: false, executionStatus: "tool-error" };
  }
  return executeRegisteredCommand(registry, commandId, values, timeoutMs);
}
