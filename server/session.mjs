import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PublicError } from "../shared/pipeline/errors.ts";

const cookie = "__Host-podcast-owner";
const hours = 12;
const digest = (value) => createHash("sha256").update(value).digest();

export function ownerBoundary(publicOrigin, ownerToken) {
  const origin = publicOrigin ? new URL(publicOrigin) : null;
  if (
    origin &&
    (origin.protocol !== "https:" ||
      origin.origin !== publicOrigin ||
      origin.username ||
      origin.password)
  )
    throw new Error("PODCAST_PUBLIC_ORIGIN must be an exact HTTPS origin");
  if (origin && (!ownerToken || !/^[A-Za-z0-9_-]{32,128}$/.test(ownerToken)))
    throw new Error(
      "PODCAST_OWNER_TOKEN must be 32–128 base64url characters for public-origin mode",
    );
  const expected = origin ? digest(ownerToken) : null;
  let session;
  let failedAttempts = [];
  return {
    privateMode: !!origin,
    checkHost(req) {
      const host = req.headers.host;
      const direct = `127.0.0.1:${req.socket.localPort}`;
      if (
        origin
          ? host !== origin.host
          : host !== direct ||
            [
              "cf-connecting-ip",
              "forwarded",
              "x-forwarded-for",
              "x-forwarded-host",
              "x-forwarded-proto",
            ].some((name) => name in req.headers)
      )
        throw new PublicError(
          "该请求的主机与服务器配置不符。",
          403,
          "worker.hostMismatch",
        );
      return origin?.origin ?? `http://${direct}`;
    },
    authorized(req) {
      if (!origin) return true;
      if (!session || session.expires <= Date.now()) return false;
      const value = req.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(cookie + "="));
      return (
        !!value &&
        timingSafeEqual(digest(value.slice(cookie.length + 1)), session.hash)
      );
    },
    checkRequest(req, expectedOrigin) {
      const site = req.headers["sec-fetch-site"];
      if (site && site !== "same-origin" && site !== "none")
        throw new PublicError(
          "请从此工作空间发起请求。",
          403,
          "worker.workspaceRequired",
        );
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers.origin !== expectedOrigin
      )
        throw new PublicError(
          "请求来源与工作空间不符。",
          403,
          "worker.originMismatch",
        );
    },
    login(token, res) {
      if (!origin)
        throw new PublicError(
          "此服务器使用本机模式。",
          409,
          "worker.localMode",
        );
      const now = Date.now();
      failedAttempts = failedAttempts.filter((time) => now - time < 300_000);
      if (failedAttempts.length >= 8)
        throw new PublicError(
          "登录尝试过多。请稍后再试。",
          429,
          "worker.loginRateLimited",
        );
      if (
        typeof token !== "string" ||
        !timingSafeEqual(digest(token), expected)
      ) {
        failedAttempts.push(now);
        throw new PublicError(
          "私有工作空间口令不正确。",
          401,
          "worker.tokenIncorrect",
        );
      }
      failedAttempts = [];
      const value = randomBytes(32).toString("base64url");
      session = { hash: digest(value), expires: now + hours * 3_600_000 };
      res.setHeader(
        "Set-Cookie",
        `${cookie}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${hours * 3600}`,
      );
    },
    logout(res) {
      session = undefined;
      res.setHeader(
        "Set-Cookie",
        `${cookie}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
    },
  };
}
