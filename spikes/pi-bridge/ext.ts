import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

type Source = "command" | "tool";
type PingReply = { id: string; pong: true; from: Source; origin: string };
type Waiter = {
  resolve: (response: PingReply) => void;
  reject: (error: Error) => void;
  source: Source;
};

export default async function (pi: ExtensionAPI) {
  const {
    PODCAST_BRIDGE_TOKEN: token,
    PODCAST_BRIDGE_ORIGIN: origin,
    PODCAST_BRIDGE_DISCOVERY: discovery,
    PODCAST_BRIDGE_TOOL_FIXTURE: useFixture,
  } = process.env;
  if (
    !token ||
    !/^[A-Za-z0-9_-]{43}$/u.test(token) ||
    !origin ||
    !/^http:\/\/127\.0\.0\.1:\d+$/u.test(origin) ||
    !discovery
  )
    throw new Error(
      "Start the disposable bridge with spikes/pi-bridge/run.mjs",
    );

  // Use Pi's own dependency resolution regardless of the npm installation prefix.
  const requirePi = createRequire(realpathSync(process.argv[1]));
  const { WebSocketServer, WebSocket } = requirePi("ws") as typeof import("ws");
  const secret = Buffer.from(token);
  let page: typeof WebSocket.prototype | undefined;
  const pending = new Map<string, Waiter>();
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    maxPayload: 8192,
    verifyClient: ({ origin: requestedOrigin, req }) => {
      if (page || requestedOrigin !== origin) return false;
      let url: URL;
      try {
        url = new URL(req.url ?? "/", origin);
      } catch {
        return false;
      }
      const tokens = url.searchParams.getAll("token");
      if (
        url.origin !== origin ||
        url.pathname !== "/bridge" ||
        tokens.length !== 1
      )
        return false;
      const offered = Buffer.from(tokens[0]);
      return (
        offered.length === secret.length && timingSafeEqual(offered, secret)
      );
    },
  });

  function stop() {
    for (const waiter of pending.values())
      waiter.reject(new Error("Bridge stopped"));
    page?.terminate();
    server.close(() => {});
  }
  pi.on("session_shutdown", stop);
  server.on("connection", (socket) => {
    page = socket;
    socket.on("error", () => socket.terminate());
    socket.on("close", () => {
      if (page !== socket) return;
      page = undefined;
      for (const waiter of pending.values())
        waiter.reject(new Error("Page disconnected"));
    });
    socket.on("message", (bytes) => {
      let reply: PingReply;
      try {
        reply = JSON.parse(String(bytes));
      } catch {
        socket.close(1007);
        return;
      }
      if (!reply || typeof reply.id !== "string") return;
      const waiter = pending.get(reply.id);
      if (
        waiter &&
        reply.pong === true &&
        reply.from === waiter.source &&
        reply.origin === origin
      )
        waiter.resolve(reply);
    });
  });

  function ping(source: Source) {
    const socket = page;
    if (!socket || socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("No page connected"));
    return new Promise<PingReply>((resolve, reject) => {
      const id = randomUUID();
      const timeout = setTimeout(
        () => finish(undefined, new Error("Page reply timed out")),
        5000,
      );
      function finish(value?: PingReply, error?: Error) {
        pending.delete(id);
        clearTimeout(timeout);
        if (error) reject(error);
        else if (value) resolve(value);
      }
      pending.set(id, {
        source,
        resolve: (value) => finish(value),
        reject: (error) => finish(undefined, error),
      });
      socket.send(
        JSON.stringify({ id, method: "ping", from: source }),
        (error) => {
          if (error) finish(undefined, new Error("Page is unavailable"));
        },
      );
    });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No bridge port");
    await writeFile(discovery, JSON.stringify({ port: address.port }), {
      mode: 0o600,
      flag: "wx",
    });

    pi.registerCommand("podcast-ping", {
      description: "Ping the paired Podcast Studio fixture page",
      handler: async (_args, { ui }) => {
        try {
          await ping("command");
          ui.notify("Page confirmed command ping", "info");
        } catch {
          ui.notify("Bridge command ping failed", "error");
        }
      },
    });
    if (useFixture === "1") {
      const { fauxProvider, fauxAssistantMessage, fauxToolCall } =
        await import("@earendil-works/pi-ai");
      const fixture = fauxProvider({
        provider: "podcast-fixture",
        models: [{ id: "offline" }],
      });
      fixture.setResponses([
        fauxAssistantMessage(fauxToolCall("podcast_bridge_ping", {}), {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage("The local tool ping completed."),
      ]);
      pi.registerProvider(fixture.provider);
      pi.registerTool({
        name: "podcast_bridge_ping",
        label: "Podcast bridge ping",
        description: "Ping the paired fixture page over the local bridge",
        parameters: Type.Object({}, { additionalProperties: false }),
        async execute() {
          const result = await ping("tool");
          return {
            content: [{ type: "text", text: "Page confirmed tool ping" }],
            details: { from: result.from, origin: result.origin },
          };
        },
      });
    }
  } catch (error) {
    stop();
    throw error;
  }
}
