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
