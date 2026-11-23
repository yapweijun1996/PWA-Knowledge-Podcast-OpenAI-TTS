import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WebSocketServer } from "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/ws/wrapper.mjs";

export default function (pi: ExtensionAPI) {
  const port = Number(process.env.PODCAST_BRIDGE_PORT);
  const token = process.env.PODCAST_BRIDGE_TOKEN;
  const origins = (process.env.PODCAST_BRIDGE_ORIGINS ?? "").split(",");
  let page: any = null;
  const pending = new Map<string, (v: any) => void>();
  const wss = new WebSocketServer({
    host: "127.0.0.1", port,
    verifyClient: ({ origin, req }: any) => origins.includes(origin) && new URL(req.url, "http://x").searchParams.get("token") === token,
  });
  wss.on("connection", (ws: any) => {
    page = ws;
    ws.on("message", (m: any) => { const r = JSON.parse(String(m)); pending.get(r.id)?.(r); pending.delete(r.id); });
  });
  const call = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    if (!page) return reject(new Error("no page connected"));
    const id = crypto.randomUUID();
    const t = setTimeout(() => { pending.delete(id); reject(new Error("page timeout")); }, 10000);
    pending.set(id, (v) => { clearTimeout(t); resolve(v); });
    page.send(JSON.stringify({ id, method, params }));
  });
  pi.registerCommand("podcast-ping", {
    description: "Ask the connected Podcast Studio page to answer",
    handler: async (_args: string, ctx: any) => {
      try { const r = await call("ping", { from: "pi" }); ctx.ui.notify("page said: " + JSON.stringify(r.result), "info"); }
      catch (e: any) { ctx.ui.notify("bridge error: " + e.message, "error"); }
    },
  });
}
