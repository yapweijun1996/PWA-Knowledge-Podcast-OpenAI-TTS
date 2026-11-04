import { expect, test } from "@playwright/test";

test("policy permits app and provider origin but blocks unintended connections and scripts", async ({
  page,
}) => {
  let allowed = 0;
  let blocked = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    allowed++;
    await route.fulfill({
      status: 200,
      body: "ok",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.route("https://example.invalid/**", async (route) => {
    blocked++;
    await route.abort();
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "把好奇，讲成故事。" }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const events: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      events.push(event.effectiveDirective),
    );
    const permitted = await (
      await fetch("https://api.openai.com/test-policy", { credentials: "omit" })
    ).text();
    const rejected = await fetch("https://example.invalid/blocked").then(
      () => false,
      () => true,
    );
    const blob = URL.createObjectURL(new Blob(["local"]));
    const local = await (await fetch(blob)).text();
    URL.revokeObjectURL(blob);
    const script = document.createElement("script");
    script.textContent = "window.policyScriptRan = true";
    document.body.appendChild(script);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      permitted,
      rejected,
      local,
      scriptRan: !!(window as unknown as { policyScriptRan?: boolean })
        .policyScriptRan,
      events,
    };
  });
  expect(result.permitted).toBe("ok");
  expect(result.rejected).toBe(true);
  expect(result.local).toBe("local");
  expect(result.scriptRan).toBe(false);
  expect(result.events).toContain("connect-src");
  expect(result.events).toContain("script-src-elem");
  expect(allowed).toBe(1);
  expect(blocked).toBe(0);
});
