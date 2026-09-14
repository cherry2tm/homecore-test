import test from "node:test";
import assert from "node:assert/strict";

import { parseToolResult } from "../dist/assets/tool-result-parser.js";

test("text success and failure markers produce deterministic verdicts", () => {
  assert.equal(parseToolResult("Result: PASS", 0, "raw", { successMarker: "Result: PASS", failureMarker: "Result: FAIL" }).verdict, "PASS");
  assert.equal(parseToolResult("Result: FAIL", 1, "raw", { successMarker: "Result: PASS", failureMarker: "Result: FAIL" }).verdict, "FAIL");
});

test("JSON parser requires an explicit boolean result field", () => {
  assert.equal(parseToolResult('{"passed":true}', 0, "raw", { json: true }).verdict, "PASS");
  assert.equal(parseToolResult('{"passed":false}', 1, "raw", { json: true }).verdict, "FAIL");
  assert.equal(parseToolResult('{"passed":"yes"}', 0, "raw", { json: true }).verdict, "BLOCKED");
});

test("unparseable output remains BLOCKED", () => {
  assert.equal(parseToolResult("finished", 0, "raw", { successMarker: "PASS" }).verdict, "BLOCKED");
  assert.equal(parseToolResult("{}", 0, "raw", { json: true }).verdict, "BLOCKED");
});
