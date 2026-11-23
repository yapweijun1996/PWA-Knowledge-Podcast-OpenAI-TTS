import { measureScene } from "./measure.js";

const resolutions = {
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
};
const form = document.querySelector("form");
const select = document.querySelector("select");
const button = document.querySelector("button");
const status = document.querySelector("#status");
const output = document.querySelector("#result");
const canvas = document.querySelector("canvas");

async function measureWorker({ width, height }) {
  const mode = "offscreen-worker";
  let worker;
  try {
    if (typeof Worker !== "function") {
      return {
        mode,
        width,
        height,
        status: "UNAVAILABLE",
        error: "Workers are unavailable.",
      };
    }
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    return await new Promise((resolve, reject) => {
      worker.addEventListener("message", ({ data }) => resolve(data), {
        once: true,
      });
      worker.addEventListener(
        "error",
        (event) => reject(new Error(event.message || "Module worker failed.")),
        { once: true },
      );
      worker.addEventListener(
        "messageerror",
        () => reject(new Error("Could not read worker results.")),
        { once: true },
      );
      worker.postMessage({ width, height });
    });
  } catch (error) {
    return { mode, width, height, status: "FAIL", error: String(error) };
  } finally {
    worker?.terminate();
  }
}

async function run() {
  const resolution = select.value;
  const dimensions = resolutions[resolution];
  select.disabled = button.disabled = true;
  output.textContent = "";
  window.threeSceneResult = null;
  try {
    status.textContent = "Measuring the main thread canvas…";
    const main = await measureScene({
      ...dimensions,
      canvas,
      mode: "main-thread",
    });
    status.textContent = "Measuring OffscreenCanvas in a worker…";
    const worker = await measureWorker(dimensions);
    const result = { resolution, secureContext: isSecureContext, main, worker };
    output.textContent = JSON.stringify(result, null, 2);
    window.threeSceneResult = result;
    status.textContent = "Benchmark complete.";
  } finally {
    select.disabled = button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!button.disabled) void run();
});
const query = new URLSearchParams(location.search);
if (Object.hasOwn(resolutions, query.get("resolution")))
  select.value = query.get("resolution");
if (query.get("autorun") === "1") void run();
