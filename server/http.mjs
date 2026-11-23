import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { studioAPI, studioBase } from "../shared/factory.ts";
import { backupLimit, restoreRecord } from "../shared/episode-backup.ts";
import { productionBounds, readPreferences } from "../shared/preferences.ts";
import { PublicError } from "../shared/pipeline/errors.ts";
import { ownerBoundary } from "./session.mjs";
import { episodeId } from "./store.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

function fileInfo(path) {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats?.isFile())
    throw new PublicError("文件不存在。", 404, "worker.fileMissing");
  return stats;
}

export function byteRange(header, size) {
  if (!header) return null;
  const range = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!range || (!range[1] && !range[2])) return false;
  const start = range[1]
    ? Number(range[1])
    : Math.max(0, size - Number(range[2]));
  const end =
    range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  return start <= end && start < size ? { start, end } : false;
}

function sendFileHeaders(req, res, size, audio) {
  if (audio) res.setHeader("Accept-Ranges", "bytes");
  const range = audio ? byteRange(req.headers.range, size) : null;
  if (range === false) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    return false;
  }
  if (range) {
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
  } else res.setHeader("Content-Length", size);
  res.writeHead(range ? 206 : 200);
  return range;
}

function serveFile(req, res, path, audio = false) {
  const { size } = fileInfo(path);
  res.setHeader(
    "Content-Type",
    types[extname(path)] ?? "application/octet-stream",
  );
  const range = sendFileHeaders(req, res, size, audio);
  if (range === false) return;
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(path, range ?? undefined);
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBytes(req, max) {
  if (Number(req.headers["content-length"]) > max)
    throw new PublicError("请求内容过长。", 413, "worker.bodyTooLong");
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      throw new PublicError("请求内容过长。", 413, "worker.bodyTooLong");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function body(req, max = 32_768) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new PublicError("请求须使用 JSON。", 415, "worker.jsonRequired");
  const deadline = setTimeout(() => req.destroy(), 20_000);
  let bytes;
  try {
    bytes = await readBytes(req, max);
  } finally {
    clearTimeout(deadline);
  }
  try {
    const data = JSON.parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new PublicError("无效的 JSON 请求。", 400, "worker.jsonInvalid");
  }
}

const summary = ({
  id,
  topic,
  language,
  updated,
  job,
  script,
  finished,
  syncToken,
  localStamp,
}) => ({
  id,
  topic,
  language,
  updated,
  job,
  syncToken,
  localStamp,
  title: script?.title,
  hasScript: !!script,
  hasAudio: !!finished,
});

export function podcastHTTP({
  dist,
  store,
  jobs,
  models,
  configured,
  production,
  publicOrigin,
  ownerToken,
}) {
  const runtime = () => ({
    ...(production?.runtime() ?? { configured }),
    models,
  });
  const requireDiscoveryIdle = () => {
    if (production?.busy)
      throw new PublicError(
        "正在自动选题，请等待完成或取消选题。",
        409,
        "discovery.busy",
      );
  };
  function bounds(p) {
    try {
      return productionBounds(
        readPreferences(p ?? production.status().preferences),
      );
    } catch (error) {
      if (error instanceof PublicError)
        throw new PublicError(error.message, 400, error.code, error.params);
      throw error;
    }
  }
  let acceptingArchive = false;
  const boundary = ownerBoundary(publicOrigin, ownerToken);
  return createServer(
    { requestTimeout: 600_000, headersTimeout: 10_000, maxHeaderSize: 16_384 },
    async (req, res) => {
      req.setTimeout?.(20_000, () => req.destroy());
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader(
        "Content-Security-Policy",
        "frame-ancestors 'none'; connect-src 'self' https://api.openai.com blob:",
      );
      res.setHeader("Cache-Control", "no-store");
      try {
        const origin = boundary.checkHost(req);
        if (!req.url?.startsWith("/") || req.url.startsWith("//"))
          throw new PublicError("路径无效。", 400, "worker.pathInvalid");
        const url = new URL(req.url, origin);
        const path = url.pathname;
        if (path === studioAPI || path.startsWith(studioAPI + "/")) {
          boundary.checkRequest(req, origin);
          const tail = path.slice(studioAPI.length);
          const [route, id, action, clipId, extra] = tail.split("/").slice(1);
          const authorized = boundary.authorized(req);
          if (tail === "/session") {
            if (req.method === "GET")
              return json(res, {
                authenticated: authorized,
                privateMode: boundary.privateMode,
                ...(authorized ? runtime() : {}),
              });
            if (req.method === "POST") {
              boundary.login((await body(req)).token, res);
              return json(res, {
                authenticated: true,
                privateMode: boundary.privateMode,
                ...runtime(),
              });
            }
            if (req.method === "DELETE" && authorized) {
              boundary.logout(res);
              return json(res, {
                authenticated: false,
                privateMode: boundary.privateMode,
              });
            }
          }
          if (!authorized)
            throw new PublicError(
              "请先登录私有工作空间。",
              401,
              "worker.loginRequired",
            );
          if (production && tail === "/key" && req.method === "PUT") {
            production.setKey((await body(req)).key);
            return json(res, {
              authenticated: true,
              privateMode: boundary.privateMode,
              ...runtime(),
            });
          }
          if (production && tail === "/schedule") {
            if (req.method === "GET") return json(res, production.status());
            if (req.method === "PUT") {
              const { preferences, consent } = await body(req);
              return json(res, production.setPreferences(preferences, consent));
            }
          }
          if (production && tail === "/discover" && req.method === "POST") {
            if ((await body(req)).consent !== true)
              throw new PublicError(
                "请确认自动选题及制作可能计费。",
                400,
                "discovery.consentRequired",
              );
            return json(res, production.start(true), 202);
          }
          if (production && tail === "/discover" && req.method === "DELETE")
            return json(res, production.pauseDiscovery());
          if (tail === "/episodes") {
            if (req.method === "GET")
              return json(res, { episodes: store.list().map(summary) });
            if (req.method === "POST") {
              const payload = await body(req);
              requireDiscoveryIdle();
              if (production) {
                const preferences = bounds(payload.preferences);
                if (payload.exactHosts !== undefined) {
                  if (payload.exactHosts !== 2)
                    throw new PublicError(
                      "请选择自动安排或恰好两位主持人。",
                      400,
                      "production.hostChoice",
                    );
                  preferences.maxHosts = payload.exactHosts;
                  preferences.exactHosts = payload.exactHosts;
                }
                const language =
                  preferences.language === "auto"
                    ? preferences.allowedLanguages[0]
                    : preferences.language;
                return json(
                  res,
                  jobs.create(
                    { ...payload, language, autoAudio: true },
                    preferences,
                  ),
                  202,
                );
              }
              return json(res, jobs.create(payload), 202);
            }
          }
          if (
            route !== "episodes" ||
            !episodeId.test(id ?? "") ||
            extra !== undefined
          )
            throw new PublicError("找不到此接口。", 404, "worker.routeMissing");
          if (!action && req.method === "GET") return json(res, store.get(id));
          if (!action && req.method === "PATCH")
            return json(res, jobs.edit(id, await body(req)));
          if (!action && req.method === "DELETE") {
            jobs.delete(id);
            return json(res, { deleted: true });
          }
          if (action === "jobs" && !clipId && req.method === "POST") {
            const payload = await body(req);
            requireDiscoveryIdle();
            return json(res, jobs.start(id, payload), 202);
          }
          if (
            production &&
            action === "transcribe-local" &&
            !clipId &&
            req.method === "POST"
          ) {
            if (req.headers["x-podcast-consent"] !== "true")
              throw new PublicError(
                "请先确认转录可能计费。",
                400,
                "transcript.consentRequired",
              );
            const stamp = req.headers["x-local-stamp"];
            if (typeof stamp !== "string" || !episodeId.test(stamp))
              throw new PublicError(
                "本地版本无效。",
                400,
                "worker.localVersionInvalid",
              );
            if (req.headers["content-type"] !== "application/octet-stream")
              throw new PublicError(
                "需要节目备份格式。",
                415,
                "worker.backupRequired",
              );
            if (!production.runtime().configured)
              throw new PublicError(
                "请先配置密钥。",
                503,
                "worker.keyRequired",
              );
            requireDiscoveryIdle();
            if (acceptingArchive || jobs.busy)
              throw new PublicError(
                "已有任务进行中，请先同步。",
                409,
                "worker.syncBusy",
              );
            acceptingArchive = true;
            try {
              const bytes = await readBytes(req, backupLimit);
              let archive;
              try {
                archive = await restoreRecord(new Blob([bytes]));
              } catch {
                throw new PublicError(
                  "节目备份或音频校验失败。",
                  400,
                  "worker.backupInvalid",
                );
              }
              const media = new Map();
              for (const [name, blob] of Object.entries(archive.assets)) {
                // Library clips are WAV-wrapped. The worker stores their PCM payload.
                const data = name.endsWith(".pcm") ? blob.slice(44) : blob;
                media.set(name, Buffer.from(await data.arrayBuffer()));
              }
              requireDiscoveryIdle();
              return json(
                res,
                jobs.transcribeLocal(id, stamp, archive.episode, media),
                202,
              );
            } finally {
              acceptingArchive = false;
            }
          }
          if (
            production &&
            action === "resume-local" &&
            !clipId &&
            req.method === "POST"
          ) {
            const input = await body(req, 262_144);
            requireDiscoveryIdle();
            return json(
              res,
              jobs.resumeLocal(id, input, bounds(input.preferences)),
              202,
            );
          }
          if (
            production &&
            action === "handoff" &&
            !clipId &&
            req.method === "POST"
          ) {
            jobs.handoff(id, (await body(req)).syncToken);
            return json(res, { released: true });
          }
          if (action === "cancel" && !clipId && req.method === "POST")
            return json(res, jobs.cancel(id), 202);
          if (
            ["GET", "HEAD"].includes(req.method) &&
            ["audio", "mp3"].includes(action) &&
            !clipId
          ) {
            const finished = store.get(id).finished;
            const asset = action === "mp3" ? finished?.mp3 : finished?.asset;
            if (!asset || asset !== url.searchParams.get("asset"))
              throw new PublicError(
                "找不到此成品音频。",
                404,
                "worker.finishedAudioMissing",
              );
            if (url.searchParams.get("download") === "1")
              res.setHeader(
                "Content-Disposition",
                'attachment; filename="podcast-' +
                  id +
                  (action === "mp3" ? '.mp3"' : '.wav"'),
              );
            return serveFile(req, res, store.assetPath(id, asset), true);
          }
          if (
            ["GET", "HEAD"].includes(req.method) &&
            action === "clip" &&
            clipId
          ) {
            const wav = jobs.clip(
              store.get(id),
              clipId,
              url.searchParams.get("asset"),
            );
            res.setHeader("Content-Type", "audio/wav");
            const range = sendFileHeaders(req, res, wav.length, true);
            if (range === false) return;
            res.end(
              req.method === "HEAD"
                ? undefined
                : range
                  ? wav.subarray(range.start, range.end + 1)
                  : wav,
            );
            return;
          }
          throw new PublicError("找不到此接口。", 404, "worker.routeMissing");
        }

        if (!["GET", "HEAD"].includes(req.method))
          throw new PublicError(
            "请求方法不受支持。",
            405,
            "worker.methodUnsupported",
          );
        if (path === "/" || path === studioBase.slice(0, -1)) {
          res.writeHead(302, { Location: studioBase + url.search }).end();
          return;
        }
        const asset = path.slice(studioBase.length) || "index.html";
        if (
          !path.startsWith(studioBase) ||
          !/^(?:assets\/[\w-]+\.(?:js|css)|fonts\/(?:noto-sans(?:-sc-(?:core|l2)|-latin)-v\d+\.woff2|coverage-sc-(?:core|l2)\.txt|OFL-NotoSans(?:SC)?\.txt)|index\.html|manifest\.webmanifest|icon(?:-192|-512)?\.(?:png|svg)|sw\.js|pcm-capture-worklet\.js)$/.test(
            asset,
          )
        )
          throw new PublicError("文件不存在。", 404, "worker.fileMissing");
        return serveFile(req, res, resolve(dist, asset));
      } catch (error) {
        if (res.headersSent || res.destroyed) return;
        if (!(error instanceof PublicError)) {
          console.error("Podcast server request failed.");
          error = new PublicError(
            "服务器未完成请求，请检查存储后重试。",
            500,
            "worker.storageFailed",
          );
        }
        const { message, code, params, status } = error;
        return json(res, { error: message, code, params }, status);
      }
    },
  );
}
