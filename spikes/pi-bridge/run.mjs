import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
assert.ok(
  !args.length || (args.length === 1 && args[0] === "--tool"),
  "Usage: node spikes/pi-bridge/run.mjs [--tool]",
);
const useTool = args.includes("--tool");
const directory = await mkdtemp(join(tmpdir(), "podcast-pi-bridge-"));
const token = randomBytes(32).toString("base64url");
const discovery = join(directory, "bridge.json");
const extension = fileURLToPath(new URL("./ext.ts", import.meta.url));
const servers = [];
let pi, piClosed, browser, launchFailure;
let stderr = "";
const records = [];

function redact(message) {
  return String(message).replaceAll(token, "[bridge token]");
}

async function serve() {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; connect-src ws://127.0.0.1:*",
    });
    response.end("<!doctype html><title>Podcast bridge fixture</title>");
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

function collect(child) {
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        records.push(JSON.parse(line));
      } catch {
        launchFailure = "Pi returned a non-JSON RPC line";
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-3000);
  });
  child.on("error", (error) => {
    launchFailure = error.code ?? "Pi spawn failed";
  });
  child.stdin.on("error", (error) => {
    launchFailure ??= error.code;
  });
}

async function receive(description, predicate) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const matching = records.find(predicate);
    if (matching) return matching;
    if (
      launchFailure ||
      pi.exitCode !== null ||
      pi.signalCode !== null ||
      Date.now() >= deadline
    )
      throw new Error(
        `Waiting for ${description} failed (${launchFailure ?? pi.exitCode ?? pi.signalCode ?? "timed out"})`,
      );
    await delay(25);
  }
}

async function request({ id, ...command }) {
  await new Promise((resolve, reject) =>
    pi.stdin.write(JSON.stringify({ id, ...command }) + "\n", (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  const response = await receive(
    command.type,
    (record) => record.type === "response" && record.id === id,
  );
  assert.ok(response.success, `Pi rejected ${command.type}`);
  return response.data;
}

async function tryHandshake(page, endpoint) {
  return page.evaluate(
    (url) =>
      new Promise((resolve) => {
        const socket = new WebSocket(url);
        const timeout = setTimeout(() => finish("timed out"), 4000);
        function finish(state) {
          clearTimeout(timeout);
          socket.close();
          resolve(state);
        }
        socket.onopen = () => finish("opened");
        socket.onerror = () => finish("rejected");
      }),
    endpoint,
  );
}

try {
  const origin = await serve();
  const otherOrigin = await serve();
  const agentDir = join(directory, "pi-settings");
  const extensionDirectory = join(agentDir, "extensions");
  await mkdir(extensionDirectory, { recursive: true });
  await writeFile(
    join(extensionDirectory, "implicit-discovery-sentinel.ts"),
    'export default () => { throw new Error("Unexpected implicit extension"); };\n',
  );
  const platformEnv = Object.fromEntries(
    [
      "PATH",
      "Path",
      "PATHEXT",
      "SYSTEMROOT",
      "SystemRoot",
      "WINDIR",
      "TMPDIR",
      "TEMP",
      "TMP",
    ]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  const piFlags = [
    "--mode",
    "rpc",
    "--no-session",
    "--offline",
    "--no-approve",
    "--no-extensions",
    "--no-mcp",
    "--no-builtin-tools",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-themes",
    "-e",
    extension,
    ...(useTool ? ["--model", "podcast-fixture/offline"] : []),
  ];
  pi = spawn(process.env.PODCAST_PI_BIN || "pi", piFlags, {
    cwd: directory,
    env: {
      ...platformEnv,
      PI_CODING_AGENT_DIR: agentDir,
      PODCAST_BRIDGE_DISCOVERY: discovery,
      PODCAST_BRIDGE_ORIGIN: origin,
      PODCAST_BRIDGE_TOKEN: token,
      PODCAST_BRIDGE_TOOL_FIXTURE: useTool ? "1" : "0",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  piClosed = new Promise((resolve) => pi.once("close", resolve));
  const spawned = once(pi, "spawn");
  collect(pi);
  await spawned;

  const state = await request({ id: "state", type: "get_state" });
  if (useTool) {
    assert.equal(state.model?.provider, "podcast-fixture");
    assert.equal(state.model?.id, "offline");
  }
  const { commands } = await request({ id: "commands", type: "get_commands" });
  assert.deepEqual(
    commands
      .filter(({ source }) => source === "extension")
      .map(({ name }) => name),
    ["podcast-ping"],
  );
  const { port } = JSON.parse(await readFile(discovery, "utf8"));
  assert.ok(
    !stderr.includes("Unexpected implicit extension"),
    "Pi loaded a discovered extension",
  );
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
  const socket = `ws://127.0.0.1:${port}/bridge`;
  const endpoint = socket + "?token=" + encodeURIComponent(token);

  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(otherOrigin);
  assert.equal(
    await tryHandshake(page, endpoint),
    "rejected",
    "Wrong Origin was accepted",
  );
  await page.goto(origin);
  assert.equal(
    await tryHandshake(page, socket + "?token=wrong"),
    "rejected",
    "Wrong token was accepted",
  );
  await page.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const received = [];
        window.podcastBridgePings = received;
        const connection = new WebSocket(url);
        const timeout = setTimeout(() => {
          connection.close();
          reject(new Error("Fixture page did not pair"));
        }, 4000);
        connection.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        connection.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Fixture page could not pair"));
        };
        connection.onmessage = ({ data }) => {
          const request = JSON.parse(data);
          if (request.method !== "ping") return;
          received.push(request);
          connection.send(
            JSON.stringify({
              id: request.id,
              pong: true,
              from: request.from,
              origin: window.location.origin,
            }),
          );
        };
        window.podcastBridgeSocket = connection;
      }),
    endpoint,
  );
  assert.equal(
    await tryHandshake(page, endpoint),
    "rejected",
    "Second page was accepted",
  );

  const command = await request({
    id: "command",
    type: "prompt",
    message: "/podcast-ping",
  });
  assert.equal(command.disposition, "handled");
  await receive(
    "command reply",
    (item) =>
      item.type === "extension_ui_request" &&
      item.message === "Page confirmed command ping",
  );
  if (useTool) {
    const run = await request({
      id: "tool",
      type: "prompt",
      message: "Ping the paired local Podcast Studio fixture.",
    });
    assert.equal(run.disposition, "started");
    const tool = await receive(
      "registered tool result",
      (item) =>
        item.type === "tool_execution_end" &&
        item.toolName === "podcast_bridge_ping",
    );
    assert.equal(tool.isError, false);
    assert.deepEqual(tool.result.details, { from: "tool", origin });
    assert.equal(tool.result.content[0].text, "Page confirmed tool ping");
    const settled = await receive(
      "model fixture settled",
      (item) => item.type === "agent_settled",
    );
    assert.equal(settled.aborted, false);
  }
  assert.deepEqual(
    await page.evaluate(() =>
      window.podcastBridgePings.map(({ method, from }) => ({ method, from })),
    ),
    useTool
      ? [
          { method: "ping", from: "command" },
          { method: "ping", from: "tool" },
        ]
      : [{ method: "ping", from: "command" }],
  );
  console.log(
    "PASS: Chromium rejected wrong Origin, wrong token and a second page. The slash command reached the paired page.",
  );
  if (useTool)
    console.log(
      "PASS: Pi's in-memory model fixture invoked the registered tool over the same bridge.",
    );
} catch (error) {
  process.exitCode = 1;
  console.error(redact(error.message));
  if (stderr.trim()) console.error(redact(stderr.trim()));
} finally {
  await browser?.close().catch(() => {});
  if (pi && piClosed) {
    pi.stdin.end();
    pi.kill("SIGTERM");
    const stopped = await Promise.race([
      piClosed.then(() => true),
      delay(2000, undefined, { ref: false }).then(() => false),
    ]);
    if (!stopped) {
      pi.kill("SIGKILL");
      await piClosed;
    }
  }
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(directory, { recursive: true, force: true });
}
