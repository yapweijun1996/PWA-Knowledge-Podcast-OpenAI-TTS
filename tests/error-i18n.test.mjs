import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parsers } from "prettier/plugins/typescript";
import { PublicError, providerError } from "../shared/pipeline/errors.ts";
import { studio } from "../src/factory/api.ts";
import { BrowserProductionError } from "../src/factory/browser-production.ts";
import { catalogues, defaultLocale } from "../src/i18n/catalogues.ts";
import { translateError } from "../src/i18n/errors.ts";
import { createTranslator, setLocale } from "../src/i18n/index.ts";

const root = new URL("../", import.meta.url);
const source = catalogues[defaultLocale];

function* nodes(node) {
  yield node;
  for (const [name, value] of Object.entries(node)) {
    if (["comments", "tokens", "parent"].includes(name)) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (typeof child?.type === "string") yield* nodes(child);
    }
  }
}

function literalCodes(node) {
  if (node?.type === "Literal" && typeof node.value === "string")
    return [node.value];
  if (node?.type === "ConditionalExpression")
    return [...literalCodes(node.consequent), ...literalCodes(node.alternate)];
  return [];
}

test("every public error code in shared and worker source has a catalogue entry", () => {
  const used = new Set();
  const files = globSync(["shared/**/*.ts", "server/*.mjs"], {
    cwd: fileURLToPath(root),
  });
  for (const file of files) {
    const contents = readFileSync(new URL(file, root), "utf8");
    for (const node of nodes(parsers.typescript.parse(contents, {}))) {
      let codes;
      if (node.type === "NewExpression" && node.callee.name === "PublicError") {
        const [message, , code] = node.arguments;
        codes = literalCodes(code);
        if (/[\p{Script=Han}]/u.test(contents.slice(...message.range))) {
          assert.ok(code, `${file} has a public message without a code`);
          if (message.type === "Literal")
            for (const code of codes)
              assert.equal(source[`errors.${code}`], message.value, code);
        }
      } else if (node.type === "NewExpression" && node.callee.name === "Error") {
        const [message] = node.arguments;
        assert.doesNotMatch(
          message ? contents.slice(...message.range) : "",
          /\p{Script=Han}/u,
          `${file} must use PublicError for a user-facing message`,
        );
      } else if (
        node.type === "CallExpression" &&
        node.callee.name === "invalidScript"
      ) {
        codes = literalCodes(node.arguments[1]);
        assert.ok(
          codes.length,
          `${file} has a script diagnostic without a code`,
        );
      } else if (
        node.type === "AssignmentExpression" &&
        node.left.object?.property?.name === "job" &&
        node.left.property?.name === "code"
      ) {
        codes = literalCodes(node.right);
      }
      for (const code of codes ?? []) used.add(`errors.${code}`);
    }
  }
  for (const [locale, catalogue] of Object.entries(catalogues)) {
    assert.deepEqual(
      Object.keys(catalogue)
        .filter((key) => key.startsWith("errors."))
        .sort(),
      [...used].sort(),
      `${locale} has missing or unused public error codes`,
    );
  }
});

test("translation resolves coded messages in the current locale and keeps legacy messages", (t) => {
  const error = new PublicError(
    "每段对话须有 1 至 450 个字符。",
    422,
    "edit.turnLength",
    {
      maximum: 450,
    },
  );
  t.after(() => setLocale(defaultLocale));
  assert.equal(translateError(error), error.message);
  setLocale("en");
  assert.equal(
    translateError(error),
    "Each turn must contain between 1 and 450 characters.",
  );
  setLocale("ms");
  assert.equal(
    translateError(error),
    "Setiap giliran bercakap mesti mengandungi antara 1 hingga 450 aksara.",
  );
  assert.equal(translateError({ message: error.message }), error.message);
  assert.equal(
    translateError({ ...error, code: "future.limit", message: error.message }),
    error.message,
  );
  assert.equal(
    translateError({
      code: error.code,
      message: error.message,
      params: { maximum: [] },
    }),
    error.message,
  );
});

test("provider mapping and error rendering filter raw diagnostics", () => {
  const english = createTranslator("en");
  assert.equal(
    providerError(429, "insufficient_quota").code,
    "openai.quotaExceeded",
  );
  assert.equal(
    providerError(429, "future_provider_code").code,
    "openai.rateLimited",
  );
  for (const message of [
    '{"error":"private provider diagnostics"}',
    "Error: private\n    at handler",
  ]) {
    assert.equal(
      translateError({ message }, english),
      english("library.error.unfinished"),
    );
  }
});

test("browser production errors keep the recovery reason and a translatable stored message", (t) => {
  const error = new BrowserProductionError("unknown", true);
  assert.equal(error.name, "AbortError");
  assert.equal(error.code, "unknown");
  const { message, code } = error.detail;
  const job = JSON.parse(JSON.stringify({ message, code }));
  t.after(() => setLocale(defaultLocale));
  setLocale("en");
  assert.match(translateError(job), /unknown outcome.*cost.*manually/);
  setLocale("ms");
  assert.equal(
    translateError(job),
    createTranslator("ms")("studio.production.unknown"),
  );
  assert.equal(translateError({ message }), message);
});

test("Studio reads coded errors from fake fetch and can render them after a locale change", async (t) => {
  const message = "每段对话须有 1 至 450 个字符。";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: message, code: "edit.turnLength", params: { maximum: 450 } },
      { status: 400 },
    ),
  );
  await assert.rejects(studio("/fixture"), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.message, message);
    assert.equal(
      error.localized(createTranslator("en"), "en"),
      "Each turn must contain between 1 and 450 characters.",
    );
    return true;
  });
});
