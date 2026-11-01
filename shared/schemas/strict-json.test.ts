import assert from "node:assert/strict";
import test from "node:test";
import { parseUnambiguousJson } from "./strict-json.js";

test("valid scalars, objects, arrays and quoted punctuation retain native JSON values", () => {
  const values: unknown[] = [null, true, false, 0, -0.25, 1e20, "", "escaped \\\" , : { [ ] }", "日本語 한국어 😀",
    { key: "same word as a key", values: [{ key: 1 }, { key: 2 }], nested: { key: 3 }, empty: {} }, [1, "a", false, null, []]];
  for (const value of values) assert.deepEqual(parseUnambiguousJson(JSON.stringify(value)), JSON.parse(JSON.stringify(value)));
  assert.deepEqual(parseUnambiguousJson(' { "a" : { "same" : 1 }, "b" : { "same" : 2 } } '), { a: { same: 1 }, b: { same: 2 } });
});

test("duplicate decoded keys fail in every object scope, including original unsafe values", () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"a":1}', '{"a":1,"\\u0061":2}',
    '{"😀":1,"\\ud83d\\ude00":2}', '{"outer":{"key":1,"key":2}}',
    '[{"key":1,"key":2}]', '{"a":[{"key":1,"key":2}],"b":1}',
    '{"a\\\"":1,"a\\\"":2}', '{"\\u0000":1,"\\u0000":2}',
    '{"key":"PRIVATE_SENTINEL","key":"safe"}']) {
    assert.throws(() => parseUnambiguousJson(text), error => error instanceof Error && error.message === "JSON_BOUNDARY_INVALID");
  }
});

test("escape parity cannot mistake quoted punctuation or same-named values for an object key", () => {
  const escaped = { a: 'ends with slash \\', b: '\\"key":', c: 'value, "key": 1', d: '[{\"key\":2}]' };
  assert.deepEqual(parseUnambiguousJson(JSON.stringify(escaped)), escaped);
  assert.deepEqual(parseUnambiguousJson('["key","key",{"key":"key"},{"key":"key"}]'), ["key", "key", { key: "key" }, { key: "key" }]);
});

test("native grammar and fixed errors reject malformed text without reflecting it", () => {
  for (const text of ["", " ", "{", "[}", '{"x":undefined}', '{"x":NaN}', '{"x":01}', '{"x":1,}',
    '{"PRIVATE_SENTINEL":', '{"x":"\\x61"}', '{"x":"\u0000"}', '\ufeff{"x":1}', '"bad\nstring"', 'null null'])
    assert.throws(() => parseUnambiguousJson(text), error => error instanceof Error && error.message === "JSON_BOUNDARY_INVALID");
});

test("byte, depth and item limits apply independently without widening caller bounds", () => {
  assert.equal(parseUnambiguousJson('"あ"', 5), "あ"); assert.throws(() => parseUnambiguousJson('"あ"', 4));
  const text = '{"x":1}'; assert.deepEqual(parseUnambiguousJson(text, text.length), { x: 1 });
  assert.throws(() => parseUnambiguousJson(text, text.length - 1));
  assert.doesNotThrow(() => parseUnambiguousJson("[".repeat(32) + "]".repeat(32)));
  assert.throws(() => parseUnambiguousJson("[".repeat(33) + "]".repeat(33)));
  assert.doesNotThrow(() => parseUnambiguousJson("[" + "0,".repeat(4095) + "0]"));
  assert.throws(() => parseUnambiguousJson("[" + "0,".repeat(4096) + "0]"));
  assert.throws(() => parseUnambiguousJson(" ".repeat(65537)));
  for (const value of [0, -1, NaN, Infinity, 65537, 1.5]) assert.throws(() => parseUnambiguousJson("{}", value));
});

test("parsing is not eval, prototype mutation or Unicode key normalization", () => {
  const before = Object.getPrototypeOf({});
  const parsed = parseUnambiguousJson('{"__proto__":{"sentinel":true},"constructor":{"prototype":{}},"é":1,"e\\u0301":2}') as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(parsed), before); assert.equal(Object.hasOwn(parsed, "__proto__"), true);
  assert.equal(Object.hasOwn({}, "sentinel"), false); assert.equal(parsed["é"], 1); assert.equal(parsed["e\u0301"], 2);
  assert.throws(() => parseUnambiguousJson('(()=>{"PRIVATE_SENTINEL"})()'));
});

test("deterministic mixed nested values agree with native parsing and reject inserted escaped aliases", () => {
  let state = 1729;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  function value(depth: number): unknown {
    switch (random() % (depth < 4 ? 6 : 4)) {
      case 0: return null;
      case 1: return random() % 100000;
      case 2: return [true, false][random() % 2];
      case 3: return ['日本語', '한국어', '😀', '\\', '"key": , }', ''][random() % 6];
      case 4: return [value(depth + 1), value(depth + 1)];
      default: return { alpha: value(depth + 1), beta: value(depth + 1) };
    }
  }
  for (let index = 0; index < 500; index++) {
    const candidate = value(0), text = JSON.stringify(candidate);
    assert.deepEqual(parseUnambiguousJson(text), JSON.parse(text));
    assert.throws(() => parseUnambiguousJson(`{"key":${text},"k\\u0065y":${text}}`));
  }
});
