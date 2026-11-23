import assert from "node:assert/strict";
import test from "node:test";
import viteConfig from "../vite.config.ts";

for (const mode of ["production", "private"]) {
  test(`${mode} build CSP allows OpenAI connections and restricts frames and scripts`, () => {
    const { plugins } = viteConfig({ command: "build", mode });
    const plugin = plugins.find(
      ({ name }) => name === "pages-content-security-policy",
    );
    assert.ok(plugin);
    assert.equal(plugin.apply, "build");
    const [meta] = plugin.transformIndexHtml.handler();
    assert.equal(meta.tag, "meta");
    assert.equal(meta.attrs["http-equiv"], "Content-Security-Policy");

    const directives = meta.attrs.content.split("; ");
    assert.ok(
      directives.includes("connect-src 'self' https://api.openai.com blob:"),
    );
    assert.ok(directives.includes("frame-src 'none'"));
    assert.ok(directives.includes("script-src 'self'"));
  });
}

test("the worker response header also allows browser BYOK connections to OpenAI", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../server/http.mjs", import.meta.url), "utf8");
  const header = /"Content-Security-Policy",\s*"([^"]+)"/.exec(source)?.[1] ?? "";
  assert.match(header, /connect-src 'self' https:\/\/api\.openai\.com blob:/);
  assert.match(header, /frame-ancestors 'none'/);
});
