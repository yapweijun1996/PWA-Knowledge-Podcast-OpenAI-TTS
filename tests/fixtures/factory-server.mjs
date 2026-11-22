import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { podcastHTTP } from "../../server/http.mjs";
import { createJobs } from "../../server/jobs.mjs";
import { createOpenAI, defaults } from "../../server/openai.mjs";
import {
  createCredential,
  createProduction,
} from "../../server/production.mjs";
import { createStore } from "../../server/store.mjs";
import { fakeOpenAI } from "./podcast-provider.mjs";

const dir = mkdtempSync(join(tmpdir(), "podcast-browser-tests-"));
const store = createStore(dir);
const fixture = fakeOpenAI({ dynamic: true });
const credential = createCredential();
const openai = createOpenAI("fixture-only", fixture.fetcher);
const jobs = createJobs({
  store,
  models: defaults,
  configured: credential.configured,
  openai,
  narrator: fixture.narrator,
});
const production = createProduction({
  root: dir,
  store,
  jobs,
  openai,
  model: defaults.research,
  credential,
  mp3: false,
});
const server = podcastHTTP({
  dist: "dist-private",
  store,
  jobs,
  models: defaults,
  production,
});
server.listen(8797, "127.0.0.1");
const timer = setInterval(() => production.start(), 250);
timer.unref();
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.on("SIGTERM", () => server.close());
