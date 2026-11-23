import type { Host } from "../../shared/factory.ts";
import { t, type createFormatters, type MessageKey } from "../i18n/index.ts";

export type AudioIdentity = {
  episodeId: string;
  revision: number;
  asset: string;
};

export type PlaybackTrack = AudioIdentity & {
  title: string;
  duration: number;
  bytes: number;
  chapters: { title: string; start: number }[];
  clipId?: string;
  clipHost?: Host;
};

export const playbackRates = [0.75, 1, 1.25, 1.5, 2];
export const resumeKey = "podcast-v2-playback";

export function formatPlaybackClock(
  seconds: number,
  number: ReturnType<typeof createFormatters>["number"],
) {
  const minutes = number(Math.floor(seconds / 60), { useGrouping: false });
  const remainder = number(Math.floor(seconds % 60), {
    minimumIntegerDigits: 2,
  });
  return `${minutes}:${remainder}`;
}

export function sameAudio(a: AudioIdentity | null, b: AudioIdentity) {
  return (
    a?.episodeId === b.episodeId &&
    a.revision === b.revision &&
    a.asset === b.asset
  );
}

export function readResume(value: string | null) {
  try {
    const saved = JSON.parse(value ?? "null");
    if (
      saved &&
      typeof saved.episodeId === "string" &&
      saved.episodeId &&
      Number.isSafeInteger(saved.revision) &&
      saved.revision > 0 &&
      typeof saved.asset === "string" &&
      saved.asset &&
      !saved.asset.startsWith("blob:") &&
      Number.isFinite(saved.position) &&
      saved.position >= 0
    ) {
      const { episodeId, revision, asset, position } = saved;
      return { episodeId, revision, asset, position } as AudioIdentity & {
        position: number;
      };
    }
  } catch {
    // Ignore invalid resume data.
  }
  return null;
}

type PlaybackErrorKey = Extract<MessageKey, `playback.error.${string}`>;

type PlaybackState = {
  track: PlaybackTrack | null;
  position: number;
  playing: boolean;
  loading: boolean;
  rate: number;
  error: string;
  errorKey?: PlaybackErrorKey;
};

function playbackError(error: string | { key: PlaybackErrorKey }) {
  return typeof error === "string"
    ? { error, errorKey: undefined }
    : { error: t(error.key), errorKey: error.key };
}

const mediaEvents = [
  "loadedmetadata",
  "timeupdate",
  "seeked",
  "play",
  "pause",
  "playing",
  "waiting",
  "ended",
  "error",
];

export class Playback {
  private audio?: HTMLAudioElement;
  private url?: string;
  private pendingSeek?: number;
  private playRequest = 0;
  private listeners = new Set<() => void>();
  private state: PlaybackState = {
    track: null,
    position: 0,
    playing: false,
    loading: false,
    rate: 1,
    error: "",
  };

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  bind(audio: HTMLAudioElement) {
    this.audio = audio;
    for (const event of mediaEvents)
      audio.addEventListener(event, this.onMediaEvent);
    return () => {
      for (const event of mediaEvents)
        audio.removeEventListener(event, this.onMediaEvent);
      this.release();
      this.audio = undefined;
    };
  }

  private update(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private release() {
    this.playRequest++;
    this.pendingSeek = undefined;
    if (!this.url) return;
    this.audio?.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    URL.revokeObjectURL(this.url);
    this.url = undefined;
  }

  invalidate(error: string | { key: PlaybackErrorKey }) {
    this.release();
    this.update({
      track: null,
      position: 0,
      playing: false,
      loading: false,
      ...playbackError(error),
    });
  }

  private onMediaEvent = () => {
    const { audio } = this;
    const { track } = this.state;
    if (!audio || !track || !this.url) return;
    if (audio.error) {
      this.invalidate({ key: "playback.error.unplayable" });
      return;
    }
    if (audio.readyState >= 1 && this.pendingSeek !== undefined) {
      audio.currentTime = this.pendingSeek;
      this.pendingSeek = undefined;
    }
    this.update({
      position: this.pendingSeek ?? Math.min(audio.currentTime, track.duration),
      playing: !audio.paused && !audio.ended,
      loading:
        audio.readyState < 1 ||
        (!audio.paused && !audio.ended && audio.readyState < 3),
    });
  };

  load(track: PlaybackTrack, blob: Blob, position = 0) {
    const { audio } = this;
    if (!audio) return false;
    this.release();
    try {
      this.url = URL.createObjectURL(blob);
    } catch {
      this.invalidate({ key: "playback.error.openFailed" });
      return false;
    }
    const start = Math.max(0, Math.min(position, track.duration));
    this.pendingSeek = start || undefined;
    audio.src = this.url;
    audio.playbackRate = this.state.rate;
    this.update({
      track,
      position: start,
      playing: false,
      loading: true,
      ...playbackError(""),
    });
    return true;
  }

  select(track: PlaybackTrack, blob: Blob, chapter?: number) {
    if (!sameAudio(this.state.track, track)) {
      if (this.load(track, blob, chapter)) this.play();
    } else if (chapter !== undefined) {
      this.seek(chapter);
      if (!this.state.playing) this.play();
    } else {
      this.toggle();
    }
  }

  private play() {
    const { audio } = this;
    if (!audio || !this.state.track) return;
    const request = ++this.playRequest;
    // Call play within the user's gesture even when metadata has yet to load.
    const play = audio.play();
    this.update({
      playing: !audio.paused && !audio.ended,
      ...playbackError(""),
    });
    void play.catch((error: unknown) => {
      if (request !== this.playRequest) return;
      this.update({
        playing: false,
        ...playbackError({
          key:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "playback.error.autoplayBlocked"
              : "playback.error.startFailed",
        }),
      });
    });
  }

  pause = () => {
    this.playRequest++;
    this.audio?.pause();
    if (this.state.playing) this.update({ playing: false });
  };

  toggle = () => {
    if (this.state.playing) this.pause();
    else this.play();
  };

  seek = (seconds: number) => {
    const { audio } = this;
    const { track } = this.state;
    if (!audio || !track || !Number.isFinite(seconds)) return;
    const position = Math.max(0, Math.min(seconds, track.duration));
    if (audio.readyState >= 1) audio.currentTime = position;
    else this.pendingSeek = position;
    this.update({ position });
  };

  setRate = (rate: number) => {
    if (!playbackRates.includes(rate) || !this.audio) return;
    this.audio.playbackRate = rate;
    this.update({ rate });
  };
}
