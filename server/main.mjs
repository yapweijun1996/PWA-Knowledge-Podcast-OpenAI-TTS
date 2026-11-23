import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createNarrator } from "./audio.mjs";
import { podcastHTTP } from "./http.mjs";
import { createJobs } from "./jobs.mjs";
import { createOpenAI, defaults } from "../shared/pipeline/openai.ts";
import { createCredential, createProduction } from "./production.mjs";
import { mp3Encoder } from "./mp3.mjs";
import { createStore } from "./store.mjs";
import { lockWorkerDirectory } from "./worker-lock.mjs";

const env = process.env;
const key = env.OPENAI_API_KEY?.trim();
const port = Number(env.PODCAST_PORT ?? 8787);
const dist = "dist-private";
const models = Object.fromEntries(
  Object.entries(defaults).map(([stage, fallback]) => [
    stage,
    env[`PODCAST_${stage.toUpperCase()}_MODEL`]?.trim() || fallback,
  ]),
);
try {
  if (
    Object.values(models).some(
      (model) => !/^[a-zA-Z0-9_.:-]{1,100}$/.test(model),
    )
  )
    throw new Error("Invalid model name");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid port");
  if (!existsSync(join(dist, "index.html"))) {
    console.error("Run npm run build:private before starting the server.");
    process.exit(1);
  }
  const root =
    env.PODCAST_DATA_DIR ||
    join(
      homedir(),
      "Library",
      "Application Support",
      "Knowledge Podcast Studio",
    );
  const store = createStore(root);
  const lock = lockWorkerDirectory(root);
  if (!lock) {
    console.error("Another podcast worker owns this data directory.");
    process.exit(1);
  }
  process.once("exit", () => lock.close());
  store.cleanInterruptedImports();
  const credential = createCredential(key);
  const openai = (...args) => createOpenAI(credential.get())(...args);
  const narrator = (...args) => createNarrator(credential.get())(...args);
  const encodeMP3 = mp3Encoder();
  const jobs = createJobs({
    store,
    openai,
    narrator,
    models,
    configured: credential.configured,
    encodeMP3,
  });
  const production = createProduction({
    root,
    store,
    jobs,
    openai,
    model: models.research,
    credential,
    mp3: !!encodeMP3,
  });
  const server = podcastHTTP({
    dist,
    store,
    jobs,
    models,
    production,
    publicOrigin: env.PODCAST_PUBLIC_ORIGIN,
    ownerToken: env.PODCAST_OWNER_TOKEN,
  });
  let timer;
  server.on("error", () => {
    console.error("Could not listen on the configured loopback port.");
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    try {
      jobs.recover();
    } catch {
      console.error("Podcast state recovery failed. Check the data folder.");
      process.exitCode = 1;
      server.close();
      return;
    }
    const tick = () => {
      try {
        production.start();
      } catch {
        console.error("Podcast scheduler could not read or save its state.");
      }
    };
    timer = setInterval(tick, 30_000);
    tick();
    console.log(
      `Private podcast server listening on 127.0.0.1:${port}${credential.configured() ? "" : " (OpenAI key not configured)"}.`,
    );
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      clearInterval(timer);
      production.stop();
      server.close();
      void jobs.stop();
    });
  }
} catch {
  console.error(
    "Podcast server could not start. Check the build, data folder, port, public origin and owner token configuration.",
  );
  process.exitCode = 1;
}
