import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsers } from "prettier/plugins/typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;

function* syntaxNodes(node) {
  yield node;
  for (const [name, value] of Object.entries(node)) {
    if (["comments", "tokens", "parent"].includes(name)) continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (typeof child?.type === "string") yield* syntaxNodes(child);
    }
  }
}

export function* sourceSyntax() {
  const files = globSync("src/**/*.{ts,tsx}", {
    cwd: root,
    exclude: ["src/i18n/**"],
  }).sort();
  for (const file of files) {
    const source = readFileSync(resolve(root, file), "utf8");
    yield [file, syntaxNodes(parsers.typescript.parse(source, {}))];
  }
}

export function textOf(node) {
  if (node.type === "TemplateElement")
    return node.value.cooked ?? node.value.raw;
  if (
    (node.type === "Literal" || node.type === "JSXText") &&
    typeof node.value === "string"
  )
    return node.value;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  let total = 0;
  let affectedFiles = 0;
  let scannedFiles = 0;
  for (const [file, nodes] of sourceSyntax()) {
    scannedFiles++;
    let count = 0;
    for (const node of nodes) {
      if (cjk.test(textOf(node) ?? "")) count++;
    }
    if (count === 0) continue;
    console.log(`${file}  ${count}`);
    total += count;
    affectedFiles++;
  }
  console.log(
    `Total: ${total} CJK text fragments in ${affectedFiles} of ${scannedFiles} files.`,
  );
  if (total > 0 && process.argv.includes("--fail-on-found"))
    process.exitCode = 1;
}
