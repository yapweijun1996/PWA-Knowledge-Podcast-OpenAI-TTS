import { useCallback, useEffect, useState } from "react";
import type { Record as LibraryRecord } from "./library";
import {
  finishedWav,
  verifyFinishedWav,
  type AudioCheck,
} from "./library-model";

const checks = new WeakMap<Blob, Promise<AudioCheck>>();

export function checkWav(blob: Blob) {
  let check = checks.get(blob);
  if (!check) {
    check = verifyFinishedWav(blob);
    checks.set(blob, check);
  }
  return check;
}

export function useCheckedWav(blob?: Blob): AudioCheck {
  const [result, setResult] = useState<{ blob: Blob; audio: AudioCheck }>();
  useEffect(() => {
    if (!blob) {
      setResult(undefined);
      return;
    }
    let current = true;
    void checkWav(blob).then((audio) => {
      if (current) setResult({ blob, audio });
    });
    return () => {
      current = false;
    };
  }, [blob]);
  if (!blob) return null;
  return result?.blob === blob ? result.audio : undefined;
}

export function useLibraryAudio(records: LibraryRecord[]) {
  const [results, setResults] = useState(new Map<Blob, AudioCheck>());

  useEffect(() => {
    let current = true;
    const blobs = new Set(
      records
        .map(({ episode, assets }) => finishedWav(episode, assets))
        .filter((blob): blob is Blob => !!blob),
    );
    void Promise.all(
      Array.from(blobs, async (blob) => [blob, await checkWav(blob)] as const),
    ).then((verified) => {
      if (current) setResults(new Map(verified));
    });
    return () => {
      current = false;
    };
  }, [records]);

  return useCallback(
    (record: LibraryRecord) => {
      const blob = finishedWav(record.episode, record.assets);
      return blob ? results.get(blob) : null;
    },
    [results],
  );
}
