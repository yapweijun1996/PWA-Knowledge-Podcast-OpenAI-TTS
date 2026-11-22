import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Episode } from "../../shared/factory";
import type { Record as LibraryRecord } from "./library";
import { episodeTitle, type AudioCheck } from "./library-model";
import {
  Playback,
  readResume,
  resumeKey,
  sameAudio,
  type PlaybackTrack,
} from "./playback";
import { checkWav } from "./useLibraryAudio";

function audioIdentity(episode: Episode, clipId?: string) {
  const { finished, render } = episode;
  if (clipId === undefined) {
    return typeof finished?.asset === "string" &&
      !finished.asset.startsWith("blob:")
      ? {
          episodeId: episode.id,
          revision: finished.revision,
          asset: finished.asset,
        }
      : undefined;
  }
  const clip = render?.revision === episode.revision && render.clips[clipId];
  return clip
    ? {
        episodeId: episode.id,
        revision: episode.revision,
        asset: clip.asset,
      }
    : undefined;
}

export function playbackTrack(
  episode: Episode,
  audio: AudioCheck,
  clipId?: string,
): PlaybackTrack | undefined {
  const identity = audioIdentity(episode, clipId);
  if (!identity || !audio) return;
  const title = episodeTitle(episode);
  const host = episode.script?.turns.find((turn) => turn.id === clipId)?.host;
  return {
    ...identity,
    clipId,
    title: host ? `${title} · 主持 ${host} 配音预览` : title,
    duration: audio.duration,
    bytes: audio.blob.size,
    chapters:
      clipId === undefined
        ? (episode.finished?.chapters ?? []).filter(
            ({ start }) =>
              Number.isFinite(start) && start >= 0 && start < audio.duration,
          )
        : [],
  };
}

function savedPosition() {
  try {
    return readResume(sessionStorage.getItem(resumeKey));
  } catch {
    return null;
  }
}

export function usePlayback(
  records: LibraryRecord[],
  libraryReady: boolean,
  getAudio: (record: LibraryRecord) => AudioCheck,
) {
  const [engine] = useState(() => new Playback());
  const audioRef = useRef<HTMLAudioElement>(null);
  const restored = useRef(false);
  const track = useSyncExternalStore(
    engine.subscribe,
    () => engine.getSnapshot().track,
  );
  const activeRecord =
    track && records.find(({ episode }) => episode.id === track.episodeId);

  useLayoutEffect(() => {
    if (!audioRef.current) return;
    return engine.bind(audioRef.current);
  }, [engine]);

  useEffect(() => {
    let previous: string | null | undefined;
    function persist(exact: boolean) {
      const { track, position } = engine.getSnapshot();
      if (!restored.current && !track) return;
      const value =
        track && track.clipId === undefined
          ? JSON.stringify({
              episodeId: track.episodeId,
              revision: track.revision,
              asset: track.asset,
              position:
                position >= track.duration
                  ? 0
                  : exact
                    ? position
                    : Math.floor(position),
            })
          : null;
      if (value === previous) return;
      previous = value;
      try {
        if (value) sessionStorage.setItem(resumeKey, value);
        else sessionStorage.removeItem(resumeKey);
      } catch {
        // Playback still works if session storage is unavailable.
      }
    }
    const unsubscribe = engine.subscribe(() => persist(false));
    const pageHide = () => persist(true);
    window.addEventListener("pagehide", pageHide);
    return () => {
      window.removeEventListener("pagehide", pageHide);
      unsubscribe();
    };
  }, [engine]);

  useEffect(() => {
    if (restored.current || !libraryReady) return;
    const saved = savedPosition();
    if (!saved || engine.getSnapshot().track) {
      restored.current = true;
      return;
    }
    const record = records.find(
      ({ episode }) => episode.id === saved.episodeId,
    );
    const identity = record && audioIdentity(record.episode);
    const audio = record && getAudio(record);
    if (identity && sameAudio(identity, saved) && audio === undefined) return;
    restored.current = true;
    const source = audio && record && playbackTrack(record.episode, audio);
    if (source && sameAudio(source, saved))
      engine.load(source, audio.blob, saved.position);
    else engine.invalidate("上次播放的音频已变更或不可用，请重新选择。");
  }, [engine, getAudio, libraryReady, records]);

  useLayoutEffect(() => {
    if (!track || engine.getSnapshot().track !== track) return;
    if (!activeRecord) {
      engine.invalidate("节目已删除，播放已停止。");
      return;
    }
    const identity = audioIdentity(activeRecord.episode, track.clipId);
    if (!identity || !sameAudio(identity, track)) {
      engine.invalidate("音频已变更，请重新选择。");
      return;
    }
    const blob = activeRecord.assets[track.asset];
    if (
      !(blob instanceof Blob) ||
      blob.type !== "audio/wav" ||
      blob.size !== track.bytes
    ) {
      engine.invalidate("本地音频已变更或不可用，请重新选择。");
      return;
    }
    // Keep the validated URL while IndexedDB supplies a fresh Blob wrapper for the same asset.
    let current = true;
    void checkWav(blob).then((audio) => {
      if (current && !audio && engine.getSnapshot().track === track)
        engine.invalidate("本地音频未通过验证，请恢复节目备份。");
    });
    return () => {
      current = false;
    };
  }, [activeRecord, engine, track]);

  return { engine, audioRef, activeRevision: activeRecord?.episode.revision };
}
