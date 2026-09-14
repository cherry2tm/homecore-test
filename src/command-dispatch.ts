export type ArgValue = string | number | boolean;

export interface CommandDefinition {
  commandId: string;
  executable: string;
  runtime: "python" | "powershell" | "native";
  workingDirectory: string;
  fixedArgs?: string[];
  args: Record<string, "string" | "number" | "boolean">;
  allowedValues?: Record<string, string[]>;
}

export interface PreparedCommand {
  commandId: string;
  executable: string;
  cwd: string;
  argv: string[];
}

export function prepareCommand(registry: ReadonlyArray<CommandDefinition>, commandId: string, values: Record<string, ArgValue>): PreparedCommand {
  const definition = registry.find((item) => item.commandId === commandId);
  if (!definition) throw new Error(`未注册命令：${commandId}`);
  for (const key of Object.keys(values)) {
    if (!(key in definition.args)) throw new Error(`未声明参数：${key}`);
    const expected = definition.args[key];
    if (typeof values[key] !== expected) throw new Error(`参数类型错误：${key}`);
    const allowed = definition.allowedValues?.[key];
    if (allowed && !allowed.includes(String(values[key]))) throw new Error(`参数值不允许：${key}`);
  }
  const missing = Object.keys(definition.args).filter((key) => !(key in values));
  if (missing.length > 0) throw new Error(`缺少参数：${missing.join(", ")}`);
  const argv = [...(definition.fixedArgs ?? []), ...Object.entries(values).flatMap(([key, value]) => [`--${key}`, String(value)])];
  return { commandId, executable: definition.executable, cwd: definition.workingDirectory, argv };
}
