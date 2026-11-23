import { useEffect, useRef, useState } from "react";
import type { Episode } from "../../shared/factory.ts";
import { browserAgentArtifacts } from "../agent/artifacts.ts";
import { download } from "../audio";
import { useI18n, type MessageKey } from "../i18n";
import { drawThumbnail, thumbnailSize } from "../publish/thumbnail.ts";
import { listScenes } from "../video/scenes/registry.ts";
import { redact } from "./browser-key.ts";
import { episodeLanguageTags } from "./Evidence";
import type { AudioCheck } from "./library-model.ts";
import {
  buildReviewedPublishPackage,
  maxVideoSeconds,
  renameVideoChapter,
  reviewLimits,
  useVideoRender,
  validatePublishReview,
  type PublishReview,
  type VideoArtifact,
} from "./useVideoRender.ts";
import "./video-panel.css";

function VideoPreview({ artifact }: { artifact: VideoArtifact }) {
  const { t, formatters } = useI18n();
  const [preview, setPreview] = useState<{ blob: Blob; url: string }>();
  const [errorUrl, setErrorUrl] = useState("");
  const [copy, setCopy] = useState<MessageKey>();
  const {
    blob,
    metadata: { studioVideo: receipt },
  } = artifact;
  const url = preview?.blob === blob ? preview.url : undefined;

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
        <video
          key={url}
          controls
          playsInline
          preload="metadata"
          src={url}
          aria-label={t("video.panel.preview")}
          onError={() => setErrorUrl(url)}
        />
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
  onSave,
}: {
  episode: Episode;
  artifact: VideoArtifact;
  review: PublishReview;
  saving: boolean;
  unsaved: boolean;
  rendering: boolean;
  onSave: (review: PublishReview) => Promise<void>;
}) {
  const { t } = useI18n();
  const { theme, timeline } = artifact.metadata.studioVideo;
  const language = episodeLanguageTags[episode.language];
  const canvas = useRef<HTMLCanvasElement>(null);
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
    const context = canvas.current?.getContext("2d");
    if (context)
      drawThumbnail(context, {
        title: redact(checked.value?.title ?? review.title),
        theme,
        language: episode.language,
      });
  }, [review.title, checked.value?.title, theme, episode.language]);

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
      const image = canvas.current;
      if (!image?.getContext("2d"))
        throw new Error("Thumbnail canvas unavailable");
      const png = await new Promise<Blob>((resolve, reject) => {
        image.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Thumbnail encoding failed"));
        }, "image/png");
      });
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
          JSON.stringify(current.review) === JSON.stringify(reviewed.review)
        );
      };
      if (!(await matchesSavedApproval())) {
        setOutcome("publish.review.changed");
        return;
      }
      signal.throwIfAborted();
      const zip = await buildReviewedPublishPackage(
        episode,
        artifact,
        png,
      ).zip();
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
      <div className="video-panel-group">
        <canvas
          ref={canvas}
          width={thumbnailSize.width}
          height={thumbnailSize.height}
          role="img"
          aria-label={t("publish.review.thumbnailPreview")}
        />
        <div className="video-panel-actions">
          <button
            className="outline"
            type="button"
            disabled={blocked || keyBlocked}
            onClick={() => void exportFile("thumbnail")}
          >
            {t("publish.review.downloadThumbnail")}
          </button>
        </div>
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
          disabled={blocked || unsaved || approved || !checked.value}
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
          disabled={blocked || !approved}
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
  const { t } = useI18n();
  const video = useVideoRender(episode, audio);
  const { state, artifact } = video;
  const rendering = state.phase === "rendering" || state.phase === "cancelling";
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
      <div className="video-panel-actions">
        <label className="field">
          {t("video.panel.theme")}
          <select
            value={video.theme}
            disabled={rendering}
            onChange={(event) =>
              video.setTheme(event.target.value === "light" ? "light" : "dark")
            }
          >
            <option value="light">{t("video.panel.light")}</option>
            <option value="dark">{t("video.panel.dark")}</option>
          </select>
        </label>
        <label className="field">
          {t("video.panel.scene")}
          <select
            value={video.sceneId}
            disabled={rendering || video.loading || !!video.reviewEdit}
            onChange={(event) => video.setSceneId(event.target.value)}
          >
            {listScenes().map(({ id, label }) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          type="button"
          disabled={
            !video.available ||
            video.support !== true ||
            rendering ||
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
      {artifact && (
        <>
          <VideoPreview artifact={artifact} />
          <ReviewFields
            key={`${artifact.id}:${artifact.metadata.studioVideo.sha256}`}
            episode={episode}
            artifact={artifact}
            review={
              video.reviewEdit?.review ?? artifact.metadata.studioVideo.review
            }
            saving={video.reviewEdit?.saving === true}
            unsaved={!!video.reviewEdit}
            rendering={rendering}
            onSave={video.saveReview}
          />
        </>
      )}
    </section>
  );
}
