import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceSyntax, textOf } from "../scripts/i18n-scan.mjs";
import { catalogueEntries } from "../src/i18n/catalogues.ts";
import {
  createFormatters,
  createTranslator,
  defaultLocale,
  I18nProvider,
  locales,
  resolveLocale,
  setLocale,
  t,
  useI18n,
} from "../src/i18n/index.ts";

function placeholders(text) {
  return [
    ...new Set(
      Array.from(
        text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g),
        ([, name]) => name,
      ),
    ),
  ].sort();
}

function checkMessage(key, message, locale) {
  const label = `${locale} ${key}`;
  if (typeof message !== "string") {
    const { pluralCategories } = new Intl.PluralRules(locale).resolvedOptions();
    assert.ok(
      Object.hasOwn(message, "other"),
      `${label} needs an 'other' form`,
    );
    for (const form of Object.keys(message)) {
      assert.ok(
        pluralCategories.includes(form),
        `${label} has invalid '${form}' form`,
      );
    }
  }
  const forms =
    typeof message === "string" ? [message] : Object.values(message);
  const expected = placeholders(forms[0]);
  for (const form of forms) {
    assert.equal(typeof form, "string", `${label} must be text`);
    const value = form.trim();
    assert.ok(value.length, `${label} is empty`);
    assert.doesNotMatch(value, /^[?？\s]+$/u, `${label} is question-mark-only`);
    assert.notEqual(value, key, `${label} equals its key`);
    assert.deepEqual(
      placeholders(form),
      expected,
      `${label} has inconsistent placeholders`,
    );
  }
  return expected;
}

test("every locale has the same unique keys, valid forms and matching placeholders", () => {
  const source = new Map(catalogueEntries[defaultLocale]);
  assert.ok(source.size > 0);
  const expectedKeys = [...source.keys()].sort();
  for (const locale of locales) {
    const entries = catalogueEntries[locale];
    assert.deepEqual(
      entries.map(([key]) => key).sort(),
      expectedKeys,
      `${locale} has missing, extra or duplicate keys`,
    );
    for (const [key, message] of entries) {
      const original = source.get(key);
      assert.equal(
        typeof message,
        typeof original,
        `${locale} ${key} changes message type`,
      );
      assert.deepEqual(
        checkMessage(key, message, locale),
        checkMessage(key, original, defaultLocale),
        `${locale} ${key} has different placeholders from ${defaultLocale}`,
      );
    }
  }
});

test("source catalogue keys are used and literal t calls have definitions", () => {
  const keys = new Set(catalogueEntries[defaultLocale].map(([key]) => key));
  const used = new Set();
  for (const [file, nodes] of sourceSyntax()) {
    for (const node of nodes) {
      const text = textOf(node);
      if (keys.has(text)) used.add(text);
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "t" &&
        node.arguments[0]?.type === "Literal"
      ) {
        const key = node.arguments[0].value;
        assert.ok(keys.has(key), `${file} uses missing translation ${key}`);
      }
    }
  }
  assert.deepEqual(
    [...used].filter((key) => !key.startsWith("errors.")).sort(),
    [...keys].filter((key) => !key.startsWith("errors.")).sort(),
    "Unused source catalogue keys",
  );
});

test("the message lint rejects empty, placeholder and invalid plural values", () => {
  const key = "library.episodes.count";
  for (const value of ["", "  ", "???", "？ ? ", key]) {
    assert.throws(() => checkMessage(key, value, "en"), assert.AssertionError);
  }
  assert.throws(
    () => checkMessage(key, { one: "One episode" }, "en"),
    /needs an 'other'/,
  );
  assert.throws(
    () => checkMessage(key, { one: "One episode", other: "Episodes" }, "ms"),
    /invalid 'one'/,
  );
  assert.throws(
    () => checkMessage(key, { one: "For {name}", other: "For {user}" }, "en"),
    /inconsistent placeholders/,
  );
});

test("interpolation and plural selection format values and use the source fallback", () => {
  const key = "library.episodes.count";
  const messages = {
    "zh-CN": { [key]: { other: "{name}有{count}期节目" } },
    en: {
      [key]: {
        one: "{name} has {count} episode",
        other: "{name} has {count} episodes",
      },
    },
  };
  const english = createTranslator("en", messages);
  assert.equal(
    english(key, { name: "$& {count}", count: 1 }),
    "$& {count} has 1 episode",
  );
  assert.equal(english(key, { name: "Lee", count: 0 }), "Lee has 0 episodes");
  assert.equal(
    english(key, { name: "Lee", count: 1200 }),
    "Lee has 1,200 episodes",
  );
  assert.equal(
    createFormatters("en", english).plural(key, 2, { name: "Lee" }),
    "Lee has 2 episodes",
  );
  assert.equal(
    createTranslator("ms", messages)(key, { name: "李", count: 1 }),
    "李有1期节目",
  );
  assert.equal(
    createTranslator("ms", { "zh-CN": { [key]: "节目" }, ms: { [key]: "" } })(
      key,
    ),
    "节目",
  );
});

test("Intl number, date and time, relative time, and list formatting are locale-aware", () => {
  const date = new Date("2026-11-23T13:05:00Z");
  const dateOptions = {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  };
  const expected = {
    "zh-CN": {
      month: /11月/,
      time: /13:05/,
      relative: "昨天",
      list: /甲、乙和丙/,
    },
    en: {
      month: /November/,
      time: /1:05.?PM/,
      relative: "yesterday",
      list: /甲, 乙, and 丙/,
    },
    ms: {
      month: /November/,
      time: /1:05.?PTG|1:05.?petang|13:05/i,
      relative: "semalam",
      list: /甲, 乙 dan 丙/,
    },
  };
  for (const locale of locales) {
    const format = createFormatters(locale);
    assert.equal(
      format.number(1234.5, { minimumFractionDigits: 2 }),
      "1,234.50",
    );
    const formatted = format.dateTime(date, dateOptions);
    assert.match(formatted, /2026/);
    assert.match(formatted, expected[locale].month);
    assert.match(formatted, expected[locale].time);
    assert.equal(
      format.relativeTime(-1, "day", { numeric: "auto" }),
      expected[locale].relative,
    );
    assert.match(format.list(["甲", "乙", "丙"]), expected[locale].list);
  }
});

test("a supported saved locale wins and browser language does not set the default", () => {
  for (const saved of locales) {
    assert.equal(resolveLocale({ getItem: () => saved }), saved);
  }
  for (const saved of [null, "en-US", "zh-Hans", "fr", ""]) {
    assert.equal(resolveLocale({ getItem: () => saved }), defaultLocale);
  }
  assert.equal(
    resolveLocale({
      getItem: () => {
        throw new Error("Storage restricted");
      },
    }),
    defaultLocale,
  );
});

test("the React hook and non-React translator share the current preference with storage unavailable", (context) => {
  const read = context.mock.fn(() => {
    throw new Error("Storage restricted");
  });
  const write = context.mock.fn(() => {
    throw new Error("Storage restricted");
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: read, setItem: write },
  });
  context.after(() => {
    setLocale(defaultLocale);
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  function Consumer() {
    const { locale, t } = useI18n();
    return createElement("span", { lang: locale }, t("shell.nav.library"));
  }
  const render = () =>
    renderToStaticMarkup(
      createElement(I18nProvider, null, createElement(Consumer)),
    );
  assert.equal(render(), '<span lang="zh-CN">资料库</span>');
  assert.equal(read.mock.callCount(), 1);
  assert.equal(t("missing.example.key"), "⟦missing.example.key⟧");
  assert.equal(t("constructor"), "⟦constructor⟧");
  setLocale("en");
  assert.equal(t("shell.nav.library"), "Library");
  assert.equal(render(), '<span lang="en">Library</span>');
  setLocale("ms");
  assert.equal(t("shell.nav.library"), "Pustaka");
  assert.equal(render(), '<span lang="ms">Pustaka</span>');
  assert.deepEqual(
    write.mock.calls.map(({ arguments: args }) => args),
    [
      ["podcast-ui-locale", "en"],
      ["podcast-ui-locale", "ms"],
    ],
  );
});
