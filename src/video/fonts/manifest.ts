export const videoFontFamilies = {
  sc: "PS Noto Sans SC",
  latin: "PS Noto Sans",
} as const;

export const videoFontManifest = {
  version: 1,
  shards: [
    {
      id: "sc-core",
      file: "noto-sans-sc-core-v1.woff2",
      family: videoFontFamilies.sc,
      weight: "600 800",
      bytes: 925_324,
      sha256:
        "5db09cb4dbd10394e6fbacf6ccc04b332e39d78140592506793ce8a9ff3150b6",
      coverageFile: "coverage-sc-core.txt",
    },
    {
      id: "latin",
      file: "noto-sans-latin-v1.woff2",
      family: videoFontFamilies.latin,
      weight: "600 800",
      bytes: 29_616,
      sha256:
        "6ee4e028cd65f3464ad3f71f7b956057e8488a6506a95d1a50fddef93d2b5d29",
      coverageFile: null,
    },
    {
      id: "sc-l2",
      file: "noto-sans-sc-l2-v1.woff2",
      family: videoFontFamilies.sc,
      weight: "600 800",
      bytes: 820_556,
      sha256:
        "166d9d94e5d66cfc91924516c9da7a1e0038a9946d9154e4fffad72beed072f6",
      coverageFile: "coverage-sc-l2.txt",
    },
  ],
  licenses: ["OFL-NotoSansSC.txt", "OFL-NotoSans.txt"],
} as const;

export type VideoFontShard = (typeof videoFontManifest.shards)[number];

export const videoFontAssets = [
  ...videoFontManifest.shards.flatMap(({ file, coverageFile }) =>
    coverageFile ? [file, coverageFile] : [file],
  ),
  ...videoFontManifest.licenses,
].map((file) => `fonts/${file}`);

/** Check the payload and its SHA-256 digest, computed by the caller. */
export function matchesVideoFontIntegrity(
  shard: Pick<VideoFontShard, "bytes" | "sha256">,
  bytes: Uint8Array,
  sha256: string,
): boolean {
  return (
    bytes.byteLength === shard.bytes &&
    bytes[0] === 0x77 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x32 &&
    sha256 === shard.sha256
  );
}
