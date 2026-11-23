import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useI18n } from "../i18n";
import {
  formatPlaybackClock,
  playbackRates,
  sameAudio,
  type Playback,
  type PlaybackTrack,
} from "./playback";
import "./playback.css";

function SeekControl({
  engine,
  position,
  track,
}: {
  engine: Playback;
  position: number;
  track: PlaybackTrack;
}) {
  const { t, formatters } = useI18n();
  const elapsed = formatPlaybackClock(position, formatters.number);
  const duration = formatPlaybackClock(track.duration, formatters.number);
  return (
    <div className="playback-seek">
      <span aria-hidden="true">{elapsed}</span>
      <input
        type="range"
        aria-label={t("playback.seek.label")}
        aria-valuetext={t("playback.seek.position", {
          position: elapsed,
          duration,
        })}
        min={0}
        max={track.duration}
        step={Math.min(1, track.duration / 100)}
        value={position}
        onChange={(event) => engine.seek(event.target.valueAsNumber)}
      />
      <span aria-hidden="true">{duration}</span>
    </div>
  );
}

export function EpisodePlayButton({
  engine,
  track,
  blob,
}: {
  engine: Playback;
  track: PlaybackTrack;
  blob: Blob;
}) {
  const { t } = useI18n();
  const playing = useSyncExternalStore(engine.subscribe, () => {
    const state = engine.getSnapshot();
    return state.playing && sameAudio(state.track, track);
  });
  return (
    <button
      className="primary"
      type="button"
      onClick={() => engine.select(track, blob)}
    >
      {t(
        track.clipId === undefined
          ? playing
            ? "playback.episode.pause"
            : "playback.episode.play"
          : playing
            ? "playback.episode.pauseClip"
            : "playback.episode.playClip",
      )}
    </button>
  );
}

export function PlaybackBar({
  engine,
  activeRevision,
  visible,
}: {
  engine: Playback;
  activeRevision?: number;
  visible: boolean;
}) {
  const { t, formatters } = useI18n();
  const { track, position, loading, playing, rate, error, errorKey } =
    useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const bar = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousVersion =
    track && track.clipId === undefined && track.revision !== activeRevision;
  const detail = previousVersion
    ? t("episode.audio.previous")
    : track?.clipId !== undefined
      ? t("playback.bar.preview")
      : "";
  const alert = errorKey ? t(errorKey) : error;
  const status = loading ? t("playback.bar.loading") : "";
  const title = track?.clipHost
    ? t("playback.episode.clipTitle", {
        title: track.title,
        host: track.clipHost,
      })
    : (track?.title ?? t("playback.bar.empty"));
  const toggle = (
    <button
      className="playback-button playback-toggle"
      type="button"
      aria-label={t(playing ? "playback.bar.pause" : "playback.bar.play")}
      onClick={engine.toggle}
    >
      <span
        className={playing ? "playback-pause-icon" : "playback-play-icon"}
        aria-hidden="true"
      />
    </button>
  );

  useLayoutEffect(() => {
    if (!visible) dialog.current?.close();
  }, [visible]);

  useLayoutEffect(() => {
    const footer = bar.current;
    const shell = footer?.closest<HTMLElement>(".factory-shell");
    if (!footer || !shell || !visible) return;

    const reserveSpace = () => {
      const height = footer.getBoundingClientRect().height;
      shell.style.setProperty("--playback-bar-height", `${height}px`);
    };
    reserveSpace();
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(footer, { box: "border-box" });
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--playback-bar-height");
    };
  }, [visible]);

  return (
    <footer
      ref={bar}
      className="playback-bar"
      aria-label={t("playback.bar.label")}
    >
      {track && (
        <progress
          className="playback-mini-progress"
          aria-hidden="true"
          value={position}
          max={track.duration}
        />
      )}
      <div className="playback-bar-content">
        <div className="playback-summary">
          <strong dir="auto" data-user-content={track ? "" : undefined}>
            {title}
          </strong>
          {detail && <span>{detail}</span>}
        </div>
        {track && (
          <>
            {toggle}
            <div className="playback-desktop-seek">
              <SeekControl engine={engine} track={track} position={position} />
            </div>
            <button
              className="playback-button playback-expand"
              type="button"
              aria-label={t("playback.bar.expand")}
              aria-haspopup="dialog"
              aria-controls="now-playing"
              onClick={() => dialog.current?.showModal()}
            >
              <span aria-hidden="true">⌃</span>
            </button>
          </>
        )}
        <div className="playback-status" role="status">
          {status}
        </div>
        <div className="playback-status" role="alert">
          {alert}
        </div>
      </div>
      <dialog
        className="playback-dialog"
        id="now-playing"
        ref={dialog}
        aria-labelledby="now-playing-title"
        onClose={() => {
          if (visible && !engine.getSnapshot().track)
            document.getElementById("factory-page-title")?.focus();
        }}
      >
        <div className="playback-dialog-header">
          <h2 id="now-playing-title">{t("playback.dialog.title")}</h2>
          <button
            className="playback-button"
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            {t("playback.dialog.close")}
          </button>
        </div>
        <p
          className="playback-dialog-title"
          dir="auto"
          data-user-content={track ? "" : undefined}
        >
          {title}
        </p>
        {detail && <p className="muted">{detail}</p>}
        <div className="playback-status" role="status">
          {status}
        </div>
        <div className="playback-status" role="alert">
          {alert}
        </div>
        {track && (
          <>
            <SeekControl engine={engine} track={track} position={position} />
            <div className="playback-dialog-actions">
              {toggle}
              <label className="playback-rate">
                {t("playback.dialog.rate")}
                <select
                  value={rate}
                  onChange={(event) =>
                    engine.setRate(Number(event.target.value))
                  }
                >
                  {playbackRates.map((speed) => (
                    <option key={speed} value={speed}>
                      {t("playback.dialog.speed", { speed })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {track.chapters.length > 0 && (
              <>
                <h3>{t("playback.chapters.title")}</h3>
                <ol className="playback-chapters">
                  {track.chapters.map((chapter) => (
                    <li key={chapter.start}>
                      <button
                        className="playback-button"
                        type="button"
                        data-user-content=""
                        onClick={() => engine.seek(chapter.start)}
                      >
                        {t("playback.chapters.entry", {
                          time: formatPlaybackClock(
                            chapter.start,
                            formatters.number,
                          ),
                          title: chapter.title,
                        })}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </dialog>
    </footer>
  );
}
