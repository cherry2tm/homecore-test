import test from "node:test";
import assert from "node:assert/strict";

import { prepareCommand } from "../dist/assets/command-dispatch.js";

const registry = [{ commandId: "homecore.check.layers", executable: "python", runtime: "python", workingDirectory: "F:/repository/homecore", args: { mode: "string", strict: "boolean" }, allowedValues: { mode: ["read-only"] } }];

test("registered typed command becomes executable plus argv", () => {
  assert.deepEqual(prepareCommand(registry, "homecore.check.layers", { mode: "read-only", strict: true }), { commandId: "homecore.check.layers", executable: "python", cwd: "F:/repository/homecore", argv: ["--mode", "read-only", "--strict", "true"] });
});

test("unregistered command and shell-like undeclared args are rejected", () => {
  assert.throws(() => prepareCommand(registry, "rm -rf", { mode: "read-only", strict: true }), /未注册/);
  assert.throws(() => prepareCommand(registry, "homecore.check.layers", { mode: "read-only", strict: true, shell: "echo pwned" }), /未声明/);
});

test("wrong types, values, and missing args are rejected", () => {
  assert.throws(() => prepareCommand(registry, "homecore.check.layers", { mode: "read-only", strict: "true" }), /类型/);
  assert.throws(() => prepareCommand(registry, "homecore.check.layers", { mode: "build", strict: true }), /不允许/);
  assert.throws(() => prepareCommand(registry, "homecore.check.layers", { mode: "read-only" }), /缺少/);
});
