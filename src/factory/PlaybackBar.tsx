import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { audioClock } from "./library-model";
import {
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
  return (
    <div className="playback-seek">
      <span aria-hidden="true">{audioClock(position)}</span>
      <input
        type="range"
        aria-label="播放进度"
        aria-valuetext={`${audioClock(position)} / ${audioClock(track.duration)}`}
        min={0}
        max={track.duration}
        step={Math.min(1, track.duration / 100)}
        value={position}
        onChange={(event) => engine.seek(event.target.valueAsNumber)}
      />
      <span aria-hidden="true">{audioClock(track.duration)}</span>
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
      {track.clipId === undefined
        ? playing
          ? "暂停本期音频"
          : "播放本期音频"
        : playing
          ? "暂停片段"
          : "播放片段"}
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
  const { track, position, loading, playing, rate, error } =
    useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousVersion =
    track && track.clipId === undefined && track.revision !== activeRevision;
  const detail = previousVersion
    ? "上一版成品音频"
    : track?.clipId !== undefined
      ? "配音预览"
      : "";
  const status = error || (loading ? "正在加载音频…" : "");
  const toggle = (
    <button
      className="playback-button playback-toggle"
      type="button"
      aria-label={playing ? "暂停" : "播放"}
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

  return (
    <footer className="playback-bar" aria-label="音频播放器">
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
          <strong dir="auto">{track?.title ?? "尚未选择音频"}</strong>
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
              aria-label="展开正在播放"
              aria-haspopup="dialog"
              aria-controls="now-playing"
              onClick={() => dialog.current?.showModal()}
            >
              <span aria-hidden="true">⌃</span>
            </button>
          </>
        )}
        <div className="playback-status" role="status" data-error={!!error}>
          {status}
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
          <h2 id="now-playing-title">正在播放</h2>
          <button
            className="playback-button"
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            关闭
          </button>
        </div>
        <p className="playback-dialog-title" dir="auto">
          {track?.title ?? "尚未选择音频"}
        </p>
        {detail && <p className="muted">{detail}</p>}
        <div className="playback-status" role="status" data-error={!!error}>
          {status}
        </div>
        {track && (
          <>
            <SeekControl engine={engine} track={track} position={position} />
            <div className="playback-dialog-actions">
              {toggle}
              <label className="playback-rate">
                播放速度
                <select
                  value={rate}
                  onChange={(event) =>
                    engine.setRate(Number(event.target.value))
                  }
                >
                  {playbackRates.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {track.chapters.length > 0 && (
              <>
                <h3>章节</h3>
                <ol className="playback-chapters">
                  {track.chapters.map((chapter) => (
                    <li key={chapter.start}>
                      <button
                        className="playback-button"
                        type="button"
                        onClick={() => engine.seek(chapter.start)}
                      >
                        {audioClock(chapter.start)} · {chapter.title}
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
