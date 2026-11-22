import { spawn, spawnSync } from "node:child_process";

export function mp3Encoder(executable = "ffmpeg") {
  const probe = spawnSync(executable, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    timeout: 3000,
  });
  if (probe.status !== 0 || !/\blibmp3lame\b/.test(probe.stdout)) return null;

  return (wav, signal) =>
    new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const child = spawn(
        executable,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "wav",
          "-i",
          "pipe:0",
          "-map_metadata",
          "-1",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "96k",
          "-f",
          "mp3",
          "pipe:1",
        ],
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
      const chunks = [];
      let size = 0;
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 8_000_000) child.kill();
        else chunks.push(chunk);
      });
      child.stdin.on("error", reject);
      child.stdout.on("error", reject);
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 && size > 0) resolve(Buffer.concat(chunks));
        else reject(new Error("MP3 encoding failed"));
      });
      child.stdin.end(wav);
    });
}
