// Some WebKit storage configurations accept ArrayBuffers but reject Blob values.
export type StoredAudio = Blob | { bytes: ArrayBuffer; type: string };

export function blobStorageFailed(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "UnknownError" &&
    error.message ===
      "Error preparing Blob/File data to be stored in object store"
  );
}

export function readStoredAudio(value: StoredAudio) {
  return value instanceof Blob
    ? value
    : new Blob([value.bytes], { type: value.type });
}

export async function encodeStoredAudio(blob: Blob) {
  return { bytes: await blob.arrayBuffer(), type: blob.type };
}
