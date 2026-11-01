import assert from "node:assert/strict";
import test from "node:test";
import { isLocale, readLocale, saveLocale } from "../src/locales/preference.js";

for (const locale of ["en", "ja", "ko"] as const) {
  test(`persists and restores only the ${locale} preference`, () => {
    const entries = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } });
    assert.equal(readLocale(storage), "en");
    assert.equal(saveLocale(locale, storage), true);
    assert.deepEqual([...entries], [["gmai-locale", locale]]);
    assert.equal(readLocale(storage), locale);
  });
}
test("rejects malformed stored locale without interpreting it", () => {
  for (const value of [null, "", "JA", "ja-JP", "fr", "__proto__", "<script>bad</script>"]) {
    assert.equal(isLocale(value), false);
    assert.equal(readLocale(() => ({ getItem: () => value, setItem: () => assert.fail("read must not write") })), "en");
  }
});
test("blocked storage getter cannot break locale selection", () => {
  const blocked = () => { throw new Error("private storage detail"); };
  assert.equal(readLocale(blocked), "en");
  assert.equal(saveLocale("ja", blocked), false);
});
test("blocked reads and quota-exceeded writes fail safely", () => {
  const storage = () => ({ getItem: (): string => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } });
  assert.equal(readLocale(storage), "en");
  assert.equal(saveLocale("ko", storage), false);
  assert.equal(saveLocale("invalid" as "en", () => { assert.fail("invalid locale must not access storage"); }), false);
});
