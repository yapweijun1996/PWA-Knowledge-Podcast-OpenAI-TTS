import { useEffect, useMemo, useRef, useState } from "react";
import type { Episode } from "../../shared/factory.ts";
import { browserAgentArtifacts } from "../agent/artifacts.ts";
import { download } from "../audio";
import { createTranslator, useI18n, type MessageKey } from "../i18n";
import {
  cjkHeadlineLength,
  headlineGraphemes,
  isCjkHeadline,
  thumbnailHeadlineLimits,
} from "../publish/thumbnail-headline.ts";
import type { Orientation } from "../video/design/tokens.ts";
import type { SceneNotice } from "../video/scenes/types.ts";
import { episodeLanguageTags } from "./Evidence";
import type { AudioCheck } from "./library-model.ts";
import {
  buildReviewedPublishPackage,
  maxVideoSeconds,
  renameVideoChapter,
  reviewLimits,
  resolveVideoOptions,
  sameVideoOptions,
  thumbnailVariants,
  useVideoRender,
  validatePublishReview,
  videoMoods,
  videoOrientations,
  videoPalettes,
  videoThumbnailInput,
  type PublishReview,
  type VideoArtifact,
} from "./useVideoRender.ts";
import "./video-panel.css";

const sceneNoticeLabels = {
  "unknown-scene": "video.panel.unknownScene",
  "webgl-unavailable": "video.studio3d.unavailable",
  "unknown-palette": "video.studio3d.unknownPalette",
  "unknown-camera": "video.studio3d.unknownCamera",
} as const satisfies Record<SceneNotice["reason"], MessageKey>;

const optionLabels = {
  landscape: "video.panel.options.landscape",
  portrait: "video.panel.options.portrait",
  aurora: "video.studio3d.palette.aurora",
  sunset: "video.studio3d.palette.sunset",
  mono: "video.studio3d.palette.mono",
  ocean: "video.studio3d.palette.ocean",
  light: "video.panel.light",
  calm: "video.panel.options.calm",
  curious: "video.panel.options.curious",
  urgent: "video.panel.options.urgent",
  warm: "video.panel.options.warm",
  serious: "video.panel.options.serious",
  "topic-graphic": "publish.thumbnail.variantTopicGraphic",
  "host-pair": "publish.thumbnail.variantHostPair",
  headline: "publish.thumbnail.variantHeadline",
} as const satisfies Record<string, MessageKey>;

function OptionSelect<T extends keyof typeof optionLabels>({
  label,
  choices,
  value,
  onChange,
  darkPaletteGroup,
  disabledChoice,
}: {
  label: MessageKey;
  choices: readonly T[];
  value: T;
  onChange: (value: T) => void;
  darkPaletteGroup?: boolean;
  disabledChoice?: T;
}) {
  const { t } = useI18n();
  const option = (choice: T) => (
    <option key={choice} value={choice} disabled={choice === disabledChoice}>
      {t(optionLabels[choice])}
    </option>
  );
  return (
    <label className="field">
      {t(label)}
      <select
        value={value}
        onChange={(event) => {
          const next = choices.find((choice) => choice === event.target.value);
          if (next && next !== disabledChoice) onChange(next);
        }}
      >
        {darkPaletteGroup ? (
          <>
            <optgroup label={t("video.panel.dark")}>
              {choices.filter((choice) => choice !== "light").map(option)}
            </optgroup>
            {choices.filter((choice) => choice === "light").map(option)}
          </>
        ) : (
          choices.map(option)
        )}
      </select>
    </label>
  );
}

function useThumbnailPreview(
  thumbnail: ReturnType<typeof videoThumbnailInput>,
  enabled: boolean,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<{
    thumbnail: typeof thumbnail;
    error?: MessageKey;
  }>();
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void (async () => {
      try {
        const [{ drawThumbnail, thumbnailSize }, { ensureVideoFonts }] =
          await Promise.all([
            import("../publish/thumbnail.ts"),
            import("../video/fonts/loader.ts"),
          ]);
        if (!current || !canvas.current) return;
        const image = canvas.current;
        image.width = thumbnailSize.width;
        image.height = thumbnailSize.height;
        const context = image.getContext("2d", {
          colorSpace: "srgb",
          alpha: false,
        });
        if (!context) throw new Error("Thumbnail canvas unavailable");
        const { input } = thumbnail;
        const wordmark = createTranslator(input.locale)("video.wordmark");
        const { missingCharacters } = await ensureVideoFonts({
          texts: thumbnail.error ? [wordmark] : [input.headline, wordmark],
        });
        if (!current) return;
        const result = drawThumbnail(context, input);
        setDrawn({
          thumbnail,
          error: missingCharacters.length
            ? "publish.thumbnail.fontUnavailable"
            : result.error,
        });
      } catch {
        if (current)
          setDrawn({ thumbnail, error: "publish.review.thumbnailFailed" });
      }
    })();
    return () => {
      current = false;
    };
  }, [enabled, thumbnail]);
  return { canvas, drawn: drawn?.thumbnail === thumbnail ? drawn : undefined };
}

function VideoPreview({
  artifact,
  orientation,
  safe,
}: {
  artifact: VideoArtifact;
  orientation: Orientation;
  safe: readonly [number, number, number, number];
}) {
  const { t, formatters } = useI18n();
  const [preview, setPreview] = useState<{ blob: Blob; url: string }>();
  const [errorUrl, setErrorUrl] = useState("");
  const [copy, setCopy] = useState<MessageKey>();
  const [guides, setGuides] = useState(false);
  const {
    blob,
    metadata: { studioVideo: receipt },
  } = artifact;
  const url = preview?.blob === blob ? preview.url : undefined;
  const notices = new Set(receipt.sceneNotices?.map(({ reason }) => reason));

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setPreview({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(t("video.panel.ffmpegCommand"));
      setCopy("video.panel.copied");
    } catch {
      setCopy("video.panel.copyFailed");
    }
  }

  return (
    <div className="video-panel-group">
      {url && (
        <>
          <label className="video-panel-check">
            <input
              type="checkbox"
              checked={guides}
              onChange={(event) => setGuides(event.target.checked)}
            />
            {t("video.panel.options.guides")}
          </label>
          <div className="video-preview-frame" data-orientation={orientation}>
            <video
              key={url}
              controls
              playsInline
              preload="metadata"
              src={url}
              aria-label={t("video.panel.preview")}
              onError={() => setErrorUrl(url)}
            />
            {guides && errorUrl !== url && (
              <div className="video-preview-guides" aria-hidden="true">
                <span
                  className="video-preview-safe"
                  style={{
                    inset: `${safe[1] * 100}% ${(1 - safe[2]) * 100}% ${(1 - safe[3]) * 100}% ${safe[0] * 100}%`,
                  }}
                />
                <span
                  className="video-preview-mask video-preview-mask-top"
                  style={{ blockSize: `${safe[1] * 100}%` }}
                />
                <span
                  className="video-preview-mask video-preview-mask-bottom"
                  style={{ insetBlockStart: `${safe[3] * 100}%` }}
                />
                {orientation === "portrait" && (
                  <span
                    className="video-preview-mask video-preview-mask-rail"
                    style={{
                      insetBlock: `${safe[1] * 100}% ${(1 - safe[3]) * 100}%`,
                      insetInlineStart: `${safe[2] * 100}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
      <div role="status" className="video-panel-status">
        {url && errorUrl === url ? t("video.panel.previewFailed") : ""}
      </div>
      <p className="muted">
        {t("video.panel.receipt", {
          video: receipt.videoCodec,
          audio:
            receipt.audioCodec === "opus"
              ? t("video.panel.opus")
              : t("video.panel.aac"),
          size: formatters.number(blob.size / 1024 ** 2, {
            maximumFractionDigits: 2,
          }),
          duration: formatters.number(receipt.durationSeconds, {
            maximumFractionDigits: 2,
          }),
          checksum: receipt.sha256.slice(0, 12),
        })}
      </p>
      {[...notices].map((reason) => (
        <p className="muted" key={reason}>
          {t(sceneNoticeLabels[reason])}
        </p>
      ))}
      <div className="video-panel-actions">
        <button
          className="outline"
          type="button"
          onClick={() => download(blob, t("publish.files.video"))}
        >
          {t("video.panel.download")}
        </button>
      </div>
      {receipt.audioCodec === "opus" && (
        <div className="video-panel-compatibility">
          <p>{t("video.panel.opusNote")}</p>
          <code lang="en" translate="no">
            {t("video.panel.ffmpegCommand")}
          </code>
          <div className="video-panel-actions">
            <button
              className="outline"
              type="button"
              onClick={() => void copyCommand()}
            >
              {t("video.panel.copyCommand")}
            </button>
          </div>
          <div role="status" className="video-panel-status">
            {copy ? t(copy) : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewFields({
  episode,
  artifact,
  review,
  saving,
  unsaved,
  rendering,
  thumbnail,
  thumbnailReady,
  onSave,
}: {
  episode: Episode;
  artifact: VideoArtifact;
  review: PublishReview;
  saving: boolean;
  unsaved: boolean;
  rendering: boolean;
  thumbnail: ReturnType<typeof videoThumbnailInput>["input"];
  thumbnailReady: boolean;
  onSave: (review: PublishReview) => Promise<void>;
}) {
  const { t } = useI18n();
  const { timeline } = artifact.metadata.studioVideo;
  const language = episodeLanguageTags[episode.language];
  const active = useRef<AbortController>(null);
  const [exporting, setExporting] = useState(false);
  const [outcome, setOutcome] = useState<MessageKey>();
  const checked = validatePublishReview(review, timeline.chapters);
  const keyBlocked = checked.error === "publish.review.keyInContent";
  const statusKeys = {
    pending: "publish.review.pending",
    approved: "publish.review.approved",
    rejected: "publish.review.rejected",
  } as const;
  const approved = review.status === "approved" && !unsaved && !!checked.value;
  const blocked = rendering || exporting;

  useEffect(() => {
    if (rendering) setExporting(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [rendering]);

  function update(next: PublishReview) {
    setOutcome(undefined);
    void onSave(next);
  }

  async function exportFile(kind: "thumbnail" | "package") {
    if (
      blocked ||
      !thumbnailReady ||
      keyBlocked ||
      active.current ||
      (kind === "package" && !approved)
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    let error: MessageKey = "publish.review.thumbnailFailed";
    setOutcome(undefined);
    setExporting(true);
    try {
      const { encodeThumbnail } = await import("../publish/thumbnail.ts");
      signal.throwIfAborted();
      const png = await encodeThumbnail(
        document.createElement("canvas"),
        thumbnail,
      );
      signal.throwIfAborted();
      if (kind === "thumbnail") {
        download(png, t("publish.files.thumbnail"));
        setOutcome("publish.review.thumbnailDownloaded");
        return;
      }

      error = "publish.review.exportFailed";
      const matchesSavedApproval = async () => {
        const saved = await browserAgentArtifacts.get(artifact.id);
        const current = saved?.metadata?.studioVideo;
        const reviewed = artifact.metadata.studioVideo;
        return (
          current?.sha256 === reviewed.sha256 &&
          sameVideoOptions(
            resolveVideoOptions(thumbnail.variant, current),
            resolveVideoOptions(thumbnail.variant, reviewed),
          ) &&
          JSON.stringify(current.review) === JSON.stringify(reviewed.review)
        );
      };
      if (!(await matchesSavedApproval())) {
        setOutcome("publish.review.changed");
        return;
      }
      signal.throwIfAborted();
      const result = await buildReviewedPublishPackage(episode, artifact, png);
      const zip = await result.zip();
      const approvedAtDownload = await matchesSavedApproval();
      signal.throwIfAborted();
      if (!approvedAtDownload) {
        setOutcome("publish.review.changed");
        return;
      }
      download(zip, t("publish.review.filename"));
      setOutcome("publish.review.downloaded");
    } catch {
      if (!signal.aborted) setOutcome(error);
    } finally {
      if (active.current === controller) active.current = null;
      if (!signal.aborted) setExporting(false);
    }
  }

  return (
    <section
      className="video-panel-group video-publish-review"
      aria-labelledby="publish-review-title"
    >
      <h4 id="publish-review-title">{t("publish.review.heading")}</h4>
      {timeline.estimated && (
        <p className="muted">{t("publish.review.estimated")}</p>
      )}
      <fieldset className="video-panel-fields" disabled={blocked}>
        <label className="field">
          {t("publish.review.title")}
          <input
            lang={language}
            value={review.title}
            maxLength={reviewLimits.title}
            onChange={(event) =>
              update({
                ...review,
                title: event.target.value,
                status: "pending",
              })
            }
          />
        </label>
        <label className="field">
          {t("publish.review.summary")}
          <textarea
            lang={language}
            rows={4}
            value={review.summary}
            maxLength={reviewLimits.summary}
            onChange={(event) =>
              update({
                ...review,
                summary: event.target.value,
                status: "pending",
              })
            }
          />
        </label>
        <label className="field">
          {t("publish.review.tags")}
          <input
            lang={language}
            value={review.tags}
            maxLength={reviewLimits.tags}
            onChange={(event) =>
              update({ ...review, tags: event.target.value, status: "pending" })
            }
          />
        </label>
        <fieldset className="video-panel-fields">
          <legend>{t("publish.review.chapters")}</legend>
          {timeline.chapters.map((chapter, index) => (
            <label className="field" key={chapter.start}>
              {t("publish.review.chapterTitle", { time: chapter.timestamp })}
              <input
                lang={language}
                value={review.chapterTitles[index] ?? ""}
                maxLength={reviewLimits.chapter}
                onChange={(event) =>
                  update(renameVideoChapter(review, index, event.target.value))
                }
              />
            </label>
          ))}
        </fieldset>
      </fieldset>
      {checked.error && (
        <p className="error">{t(checked.error, reviewLimits)}</p>
      )}
      <div className="video-panel-actions">
        <button
          className="outline"
          type="button"
          disabled={blocked || keyBlocked || !thumbnailReady}
          onClick={() => void exportFile("thumbnail")}
        >
          {t("publish.review.downloadThumbnail")}
        </button>
      </div>
      <div role="status" className="video-panel-status">
        {keyBlocked
          ? ""
          : t(
              saving
                ? "publish.review.saving"
                : unsaved
                  ? "publish.review.saveFailed"
                  : statusKeys[review.status],
            )}
      </div>
      <div className="video-panel-actions">
        {unsaved && !saving && !keyBlocked && (
          <button
            className="outline"
            type="button"
            disabled={blocked}
            onClick={() => void onSave(review)}
          >
            {t("publish.review.save")}
          </button>
        )}
        <button
          className="outline"
          type="button"
          disabled={
            blocked || unsaved || approved || !checked.value || !thumbnailReady
          }
          onClick={() =>
            checked.value && update({ ...checked.value, status: "approved" })
          }
        >
          {t("publish.review.approve")}
        </button>
        <button
          className="outline"
          type="button"
          disabled={blocked || unsaved || review.status === "rejected"}
          onClick={() => update({ ...review, status: "rejected" })}
        >
          {t("publish.review.reject")}
        </button>
        <button
          className="primary"
          type="button"
          disabled={blocked || !approved || !thumbnailReady}
          onClick={() => void exportFile("package")}
        >
          {t("publish.review.downloadPackage")}
        </button>
      </div>
      <div role="status" className="video-panel-status">
        {outcome
          ? t(outcome)
          : exporting
            ? t("publish.review.preparingDownload")
            : ""}
      </div>
    </section>
  );
}

export function VideoPanel({
  episode,
  audio,
}: {
  episode: Episode;
  audio: AudioCheck;
}) {
  const { t, formatters } = useI18n();
  const video = useVideoRender(episode, audio);
  const { state, artifact, camera, options, tokens } = video;
  const dimensions = tokens?.[options.orientation].frame;
  const isStudio3d = video.sceneId === "studio3d";
  const rendering = state.phase === "rendering" || state.phase === "cancelling";
  const optionsDisabled = rendering || video.loading || !!video.reviewEdit;
  const review =
    artifact &&
    (video.reviewEdit?.review ?? artifact.metadata.studioVideo.review);
  const reviewTitle =
    artifact && review
      ? (validatePublishReview(
          review,
          artifact.metadata.studioVideo.timeline.chapters,
        ).value?.title ?? review.title)
      : undefined;
  const thumbnail = useMemo(
    () => videoThumbnailInput(episode, options, reviewTitle),
    [episode, options, reviewTitle],
  );
  const { canvas, drawn } = useThumbnailPreview(thumbnail, !!tokens);
  const headlineError = thumbnail.error ?? drawn?.error;
  const { headline, locale: headlineLocale } = thumbnail.input;
  const cjk = isCjkHeadline(headline);
  const count = cjk
    ? cjkHeadlineLength(headline.trim(), headlineLocale)
    : headlineGraphemes(headline.trim().replace(/\s+/gu, " "), headlineLocale)
        .length;
  const limit = cjk
    ? thumbnailHeadlineLimits.cjk[1]
    : headlineLocale === "ms"
      ? thumbnailHeadlineLimits.malayGraphemes
      : thumbnailHeadlineLimits.latinGraphemes;
  const status =
    state.phase === "failed"
      ? state.message
      : state.phase === "rendering"
        ? "video.panel.rendering"
        : state.phase === "cancelling"
          ? "video.panel.cancelling"
          : state.phase === "cancelled"
            ? "video.panel.cancelled"
            : artifact
              ? "video.panel.done"
              : video.loading || video.support === undefined
                ? "video.panel.checking"
                : video.loadFailed
                  ? "video.panel.loadFailed"
                  : video.support === false
                    ? "video.panel.unsupported"
                    : !video.available
                      ? "video.panel.needsAudio"
                      : "video.panel.idle";

  return (
    <section
      className="factory-panel video-panel"
      aria-labelledby="video-panel-title"
    >
      <h3 id="video-panel-title">{t("episode.video.title")}</h3>
      <p className="muted">{t("video.panel.local")}</p>
      <fieldset
        className="video-panel-fields video-option-fields"
        disabled={optionsDisabled || !tokens}
      >
        <legend>{t("video.panel.options.heading")}</legend>
        <label className="field">
          {t("video.panel.scene")}
          <select
            value={video.sceneId}
            aria-describedby={
              isStudio3d ? "video-studio3d-description" : undefined
            }
            onChange={(event) => video.setSceneId(event.target.value)}
          >
            {video.scenes.map(({ id, label }) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <OptionSelect
          label="video.panel.options.orientation"
          choices={videoOrientations}
          value={options.orientation}
          onChange={(orientation) =>
            video.setOptions({ ...options, orientation })
          }
        />
        <OptionSelect
          label={isStudio3d ? "video.studio3d.palette" : "video.panel.theme"}
          choices={
            isStudio3d
              ? videoPalettes.filter((id) => id !== "light")
              : videoPalettes
          }
          value={options.paletteId}
          onChange={(paletteId) => video.setOptions({ ...options, paletteId })}
          darkPaletteGroup={!isStudio3d}
        />
        <OptionSelect
          label="video.panel.options.mood"
          choices={videoMoods}
          value={options.mood}
          onChange={(mood) => video.setOptions({ ...options, mood })}
        />
        <label className="video-panel-check">
          <input
            type="checkbox"
            checked={options.reducedMotion}
            onChange={(event) =>
              video.setOptions({
                ...options,
                reducedMotion: event.target.checked,
              })
            }
          />
          {t("video.panel.options.reducedMotion")}
        </label>
        {dimensions && (
          <p className="muted">
            {t("video.panel.options.dimensions", {
              width: dimensions[0],
              height: dimensions[1],
            })}
          </p>
        )}
      </fieldset>
      {isStudio3d && video.cameraLabels && (
        <>
          <p className="muted" id="video-studio3d-description">
            {t("video.studio3d.description")}
          </p>
          <fieldset
            className="video-panel-fields video-studio3d-fields"
            aria-label={t("video.scene.studio3d")}
            disabled={rendering || video.loading || !!video.reviewEdit}
          >
            <label className="field">
              {t("video.studio3d.camera")}
              <select
                value={camera.cameraPresetId}
                onChange={(event) => {
                  const preset = event.target
                    .value as typeof camera.cameraPresetId;
                  if (Object.hasOwn(video.cameraLabels ?? {}, preset))
                    video.setCamera({ ...camera, cameraPresetId: preset });
                }}
              >
                {Object.entries(video.cameraLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("video.studio3d.intensity")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={camera.intensity}
                aria-valuetext={formatters.number(camera.intensity, {
                  style: "percent",
                })}
                onChange={(event) =>
                  video.setCamera({
                    ...camera,
                    intensity: event.target.valueAsNumber,
                  })
                }
              />
            </label>
          </fieldset>
        </>
      )}
      {tokens && (
        <fieldset
          className="video-panel-fields video-thumbnail-options"
          disabled={optionsDisabled}
        >
          <legend>{t("publish.review.thumbnailOptions")}</legend>
          <OptionSelect
            label="publish.review.thumbnailVariant"
            choices={thumbnailVariants}
            value={options.thumbnailVariant}
            disabledChoice={video.hasTopicGraphic ? undefined : "topic-graphic"}
            onChange={(thumbnailVariant) =>
              video.setOptions({ ...options, thumbnailVariant })
            }
          />
          <label className="field">
            {t("publish.review.thumbnailHeadline")}
            <input
              lang={episodeLanguageTags[episode.language]}
              type="text"
              value={options.thumbnailHeadline}
              aria-invalid={!!headlineError}
              aria-describedby="video-headline-hint video-headline-status"
              onChange={(event) =>
                video.setOptions({
                  ...options,
                  thumbnailHeadline: event.target.value,
                })
              }
            />
          </label>
          <p className="muted" id="video-headline-hint">
            {t("publish.review.thumbnailHeadlineHint")}{" "}
            {t("publish.review.thumbnailHeadlineCount", { count, limit })}
          </p>
          <div
            className="video-panel-status"
            id="video-headline-status"
            role="status"
          >
            {headlineError && <p className="error">{t(headlineError)}</p>}
          </div>
          <canvas
            ref={canvas}
            width={1280}
            height={720}
            role="img"
            aria-label={t("publish.review.thumbnailPreview")}
          />
        </fieldset>
      )}
      <div className="video-panel-actions">
        <button
          className="primary"
          type="button"
          disabled={
            !video.available ||
            video.support !== true ||
            rendering ||
            video.keyInHeadline ||
            !!video.reviewEdit
          }
          onClick={() => void video.start()}
        >
          {t("video.panel.render")}
        </button>
        <button
          className="outline"
          type="button"
          disabled={state.phase !== "rendering"}
          onClick={video.cancel}
        >
          {t("video.panel.cancel")}
        </button>
      </div>
      <div role="status" className="video-panel-status">
        {video.stale && <p>{t("episode.video.stale")}</p>}
        {video.sceneStale && <p>{t("video.panel.sceneStale")}</p>}
        {video.optionsStale && !video.sceneStale && (
          <p>{t("video.panel.options.stale")}</p>
        )}
        <p
          className={
            state.phase === "failed" || video.loadFailed ? "error" : "muted"
          }
        >
          {t(status, { seconds: maxVideoSeconds })}
        </p>
        {artifact && video.support === false && (
          <p>{t("video.panel.unsupported")}</p>
        )}
      </div>
      {state.phase === "rendering" && state.total > 0 && (
        <div className="video-panel-progress">
          <progress
            value={state.frames}
            max={state.total}
            aria-label={t("video.panel.progressLabel")}
            aria-valuetext={t("video.panel.progress", {
              done: state.frames,
              total: state.total,
            })}
          />
          <span aria-hidden="true">
            {t("video.panel.progress", {
              done: state.frames,
              total: state.total,
            })}
          </span>
        </div>
      )}
      {artifact && tokens && (
        <VideoPreview
          artifact={artifact}
          orientation={options.orientation}
          safe={tokens[options.orientation].safe}
        />
      )}
      {artifact && review && (
        <>
          <ReviewFields
            key={`${artifact.id}:${artifact.metadata.studioVideo.sha256}`}
            episode={episode}
            artifact={artifact}
            review={review}
            saving={video.reviewEdit?.saving === true}
            unsaved={!!video.reviewEdit}
            rendering={rendering}
            thumbnail={thumbnail.input}
            thumbnailReady={!!drawn && !headlineError}
            onSave={video.saveReview}
          />
        </>
      )}
    </section>
  );
}
