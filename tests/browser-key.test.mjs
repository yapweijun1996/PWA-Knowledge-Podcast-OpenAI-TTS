import assert from "node:assert/strict";
import test from "node:test";
import * as browserKey from "../src/factory/browser-key.ts";

const fixtureKey = "sk-browser-fixture";

test("the browser key is trimmed and invalid replacements preserve the current key", (t) => {
  t.after(browserKey.clear);
  assert.equal(browserKey.get(), undefined);
  assert.equal(browserKey.hasKey(), false);
  browserKey.set(` \t${fixtureKey}\n `);
  assert.equal(browserKey.get(), fixtureKey);
  assert.equal(browserKey.hasKey(), true);

  for (const invalid of [
    "",
    " \t\n",
    `${fixtureKey}\tinvalid`,
    "x".repeat(513),
  ]) {
    assert.throws(
      () => browserKey.set(invalid),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(fixtureKey));
        if (invalid.trim()) assert.ok(!error.message.includes(invalid));
        return true;
      },
    );
    assert.equal(browserKey.get(), fixtureKey);
  }
  browserKey.set("x".repeat(512));
  assert.equal(browserKey.get(), "x".repeat(512));
});

test("browser key subscribers receive changes without the credential", (t) => {
  t.after(browserKey.clear);
  const states = [];
  const unsubscribe = browserKey.subscribe((...args) => {
    states.push([browserKey.hasKey(), args]);
  });
  t.after(unsubscribe);

  browserKey.clear();
  browserKey.set(fixtureKey);
  browserKey.set(` ${fixtureKey} `);
  browserKey.set("prefixless-fixture");
  browserKey.clear();
  browserKey.clear();
  unsubscribe();
  browserKey.set(fixtureKey);

  assert.deepEqual(states, [
    [true, []],
    [true, []],
    [false, []],
  ]);
});

test("redaction masks all literal occurrences of the active browser key", (t) => {
  t.after(browserKey.clear);
  const token = "fixture.$[key]";
  const message = `Rejected ${token} (Bearer ${token})`;
  browserKey.set(token);
  assert.equal(
    browserKey.redact(message),
    "Rejected [REDACTED] (Bearer [REDACTED])",
  );
  assert.equal(browserKey.redact("Unrelated error"), "Unrelated error");
  browserKey.set("REDACTED");
  assert.equal(browserKey.redact("Rejected REDACTED"), "");
  browserKey.clear();
  assert.equal(browserKey.redact(message), message);
});

test("the browser key stays in page memory and clears on pagehide", async (t) => {
  const window = new EventTarget();
  const storageAccess = t.mock.fn();
  const globals = { window: { value: window } };
  for (const name of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "document",
    "caches",
    "location",
  ]) {
    const descriptor = { get: storageAccess, configurable: true };
    Object.defineProperty(window, name, descriptor);
    globals[name] = descriptor;
  }
  for (const [name, descriptor] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      ...descriptor,
      configurable: true,
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }

  const session = await import("../src/factory/browser-key.ts?browser");
  const listener = t.mock.fn();
  session.subscribe(listener);
  for (const key of [fixtureKey, "replacement-fixture"]) {
    session.set(key);
    assert.equal(session.get(), key);
    window.dispatchEvent(new Event("pagehide"));
    assert.equal(session.get(), undefined);
    assert.equal(session.hasKey(), false);
  }
  assert.equal(listener.mock.callCount(), 4);
  assert.equal(storageAccess.mock.callCount(), 0);
});
