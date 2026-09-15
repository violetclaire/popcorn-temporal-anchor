import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseTaskSchedule, evaluateTaskSchedule, verifyTaskScheduleSample } from "../src/task-schedule.js";

const packet = JSON.parse(await readFile(new URL("../../../examples/task-schedule/packet.json", import.meta.url), "utf8"));
const bytes = Buffer.from(packet.schedule_base64url, "base64url");
const schedule = parseTaskSchedule(bytes);
test("real task schedule verifies offline; changing who fails", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("must be offline"); });
  const result = await verifyTaskScheduleSample(packet);
  assert.equal(result.verified, true);
  assert.equal(result.digest_matches, true);
  assert.equal(result.one_byte_who_tamper_rejected, true);
});
test("expiry wins at equality; uncertainty never proceeds", () => {
  const E = Date.parse(schedule.expire_utc);
  assert.equal(evaluateTaskSchedule(schedule, E, E, true), "STOP");
  assert.equal(evaluateTaskSchedule(schedule, E - 1, E, true), "REFETCH");
  assert.equal(evaluateTaskSchedule({ ...schedule, on_no: "REFER" }, E, E, true), "STOP");
});
test("invalid intervals stop even when the condition is false", () => {
  assert.equal(evaluateTaskSchedule({ ...schedule, on_no: "REFER" }, NaN, NaN, false), "STOP");
  assert.equal(evaluateTaskSchedule(schedule, NaN, NaN, null), "STOP");
});

test("established expiry wins over NO; only true reaches refetch", () => {
  const E = Date.parse(schedule.expire_utc);
  const s = { ...schedule, on_no: "COUNTER" };
  assert.equal(evaluateTaskSchedule(s, E, E, false), "STOP");
  assert.equal(evaluateTaskSchedule(s, E - 1, E, false), "COUNTER");
  assert.equal(evaluateTaskSchedule(s, E - 1, E, true), "REFETCH");
  assert.equal(evaluateTaskSchedule(s, E - 1, E, null), "STOP");
});

test("runtime condition types cannot masquerade as a true YES", () => {
  const B = Date.parse(schedule.boundary_utc);
  for (const condition of ["false", "true", {}, [], 1, 0, undefined]) {
    assert.equal(evaluateTaskSchedule(schedule, B - 2, B - 1, condition as any), "STOP");
  }
  for (const [L, U] of [[-Infinity, -Infinity], [B - 1, Infinity], [NaN, NaN], [B, B - 1]]) {
    assert.equal(evaluateTaskSchedule(schedule, L, U, true), "STOP");
    assert.equal(evaluateTaskSchedule(schedule, L, U, false), "STOP");
  }
});

test("invalid UTF-8 is rejected rather than replaced", () => {
  const invalid = Buffer.from(bytes);
  invalid[invalid.indexOf(Buffer.from("who: ")) + 5] = 255;
  assert.throws(() => parseTaskSchedule(invalid));
});
test("both boundary equality conventions and a fractional crossing", () => {
  const B = Date.parse(schedule.boundary_utc);
  for (const [rule, atBoundary] of [["yes_if_before", "STOP"], ["yes_if_on_or_before", "PROCEED"]]) {
    const s = { ...schedule, boundary_rule: rule };
    assert.equal(evaluateTaskSchedule(s, B, B, true), atBoundary);
    assert.equal(evaluateTaskSchedule(s, B - 1, B - .001, true), "PROCEED");
    assert.equal(evaluateTaskSchedule(s, B - .001, B + .001, true), "REFETCH");
  }
  assert.equal(evaluateTaskSchedule(schedule, B - 2, B - 1, null), "STOP");
  assert.equal(evaluateTaskSchedule(schedule, B, B - 1, true), "STOP");
});
test("byte framing rejects BOM, CRLF, missing who, missing final LF and impossible dates", () => {
  for (const text of ["\ufeff" + packet.schedule_utf8, packet.schedule_utf8.replaceAll("\n", "\r\n"),
    packet.schedule_utf8.replace("who: Codex\n", ""), packet.schedule_utf8.slice(0, -1),
    packet.schedule_utf8.replace("2026-09-08", "2026-02-30")]) {
    assert.throws(() => parseTaskSchedule(Buffer.from(text)));
  }
});
