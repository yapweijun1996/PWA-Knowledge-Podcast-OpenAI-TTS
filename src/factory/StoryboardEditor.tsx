import { useEffect, useState } from "react";
import type { Episode } from "../../shared/factory.ts";
import { redactCredentials } from "../agent/runtime.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { paletteIds } from "../video/design/palettes.ts";
import {
  cameraLabels,
  paletteLabels,
} from "../video/scenes/studio3d/presets.ts";
import {
  maxCalloutPercent,
  maxStoryboardCallouts,
  sameStoryboard,
  storyboardKey,
  storyboardMetaphors,
  storyboardMoods,
  storyboardScript,
  validateStoryboard,
  type Storyboard,
  type StoryboardChapter,
} from "../video/storyboard.ts";
import {
  browserStoryboards,
  subscribeStoryboards,
  type StoryboardDraft,
  type StoryboardRecord,
} from "../video/storyboard-store.ts";
import { get as getBrowserKey } from "./browser-key.ts";

type Snapshot = {
  binding: string;
  key?: string;
  record?: StoryboardRecord;
  failed?: boolean;
};

export function useStoryboard(episode: Episode) {
  const script = storyboardScript(episode);
  const binding = JSON.stringify([episode.id, episode.revision, script]);
  const [stored, setStored] = useState<Snapshot>();
  const snapshot = stored?.binding === binding ? stored : undefined;

  useEffect(() => {
    let stopped = false;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const key = await storyboardKey(episode);
        const value = key ? await browserStoryboards.get(key) : undefined;
        const unmasked = (plan: unknown) => {
          const text = JSON.stringify(plan);
          return text && redactCredentials(text, getBrowserKey()) === text
            ? validateStoryboard(plan, episode)
            : undefined;
        };
        const draft = unmasked(value?.draft);
        const applied = unmasked(value?.applied);
        const record =
          value && draft ? { stamp: value.stamp, draft, applied } : undefined;
        if (!stopped && current === revision)
          setStored({ binding, key, record, failed: !!value && !draft });
      } catch {
        if (!stopped && current === revision)
          setStored({ binding, failed: true });
      }
    }
    const unsubscribe = subscribeStoryboards(() => void refresh());
    void refresh();
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [binding]);

  async function persist(value: StoryboardDraft, expected: string | undefined) {
    if (!snapshot?.key) return;
    const saved = await browserStoryboards.put(snapshot.key, value, expected);
    if (saved)
      setStored((current) =>
        current?.binding === binding
          ? { ...current, record: saved, failed: false }
          : current,
      );
    return saved;
  }
  return {
    binding,
    script,
    record: snapshot?.record,
    loading: !!script && !snapshot,
    failed: snapshot?.failed,
    persist,
  };
}

const moodLabels = {
  calm: "video.panel.options.calm",
  curious: "video.panel.options.curious",
  urgent: "video.panel.options.urgent",
  warm: "video.panel.options.warm",
  serious: "video.panel.options.serious",
} as const satisfies Record<StoryboardChapter["mood"], MessageKey>;
const metaphorLabels = {
  "voice-rails": "video.scene.waveform",
  "host-orbs": "video.scene.studio3d",
} as const satisfies Record<StoryboardChapter["visualMetaphor"], MessageKey>;

function ChapterChoice<T extends string>({
  label,
  choices,
  labels,
  value,
  onChange,
  disabled,
}: {
  label: MessageKey;
  choices: readonly T[];
  labels: Record<T, MessageKey>;
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="field">
      {t(label)}
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = choices.find((item) => item === event.target.value);
          if (next) onChange(next);
        }}
      >
        {choices.map((item) => (
          <option value={item} key={item}>
            {t(labels[item])}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StoryboardEditor({
  episode,
  board,
  disabled,
  defaults,
}: {
  episode: Episode;
  board: ReturnType<typeof useStoryboard>;
  disabled: boolean;
  defaults: Pick<
    StoryboardChapter,
    "mood" | "paletteId" | "visualMetaphor" | "cameraPresetId"
  >;
}) {
  const { t } = useI18n();
  const [local, setLocal] = useState<{
    binding: string;
    draft: Storyboard;
    stamp?: string;
  }>();
  const [status, setStatus] = useState<{ binding: string; key: MessageKey }>();
  const [busy, setBusy] = useState(false);

  const editing = local?.binding === board.binding ? local : undefined;
  const draft = editing?.draft ?? board.record?.draft;
  const applied = board.record?.applied;
  const conflict = !!editing && editing.stamp !== board.record?.stamp;
  const notices = status?.binding === board.binding ? status.key : undefined;
  if (!board.script) return null;

  function edit(next: Storyboard) {
    setLocal({
      binding: board.binding,
      draft: next,
      stamp: editing ? editing.stamp : board.record?.stamp,
    });
    setStatus(undefined);
  }

  function patchChapter(index: number, patch: Partial<StoryboardChapter>) {
    if (!draft) return;
    edit({
      ...draft,
      chapters: draft.chapters.map((chapter, i) =>
        i === index ? { ...chapter, ...patch } : chapter,
      ),
    });
  }

  async function save(action: "draft" | "apply" | "remove") {
    const candidate = action === "remove" ? board.record?.draft : draft;
    const checked = validateStoryboard(candidate, episode);
    const notice = (key: MessageKey) =>
      setStatus({ binding: board.binding, key });
    if (!checked) {
      notice("video.storyboard.invalid");
      return;
    }
    const text = JSON.stringify(checked);
    if (redactCredentials(text, getBrowserKey()) !== text) {
      notice("video.panel.keyInContent");
      return;
    }
    setBusy(true);
    try {
      const saved = await board.persist(
        {
          draft: checked,
          ...(action === "apply"
            ? { applied: checked }
            : action === "draft" && applied
              ? { applied }
              : {}),
        },
        action !== "remove" && editing ? editing.stamp : board.record?.stamp,
      );
      if (!saved) {
        notice("video.storyboard.conflict");
        return;
      }
      setLocal(undefined);
      notice(
        action === "apply"
          ? "video.storyboard.applied"
          : action === "remove"
            ? "video.storyboard.removed"
            : "video.storyboard.saved",
      );
    } catch {
      notice("video.storyboard.failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="video-panel-group storyboard">
      <summary>{t("video.storyboard.title")}</summary>
      <p className="muted">{t("video.storyboard.help")}</p>
      {applied && <p>{t("video.storyboard.active")}</p>}
      <fieldset
        className="video-panel-fields"
        disabled={disabled || busy || board.loading || board.failed}
      >
        <legend>{t("video.storyboard.draft")}</legend>
        {!draft && (
          <button
            className="outline"
            type="button"
            onClick={() =>
              edit({
                schemaVersion: 1,
                chapters: board.script!.chapters.map(({ chapterId }) => ({
                  chapterId,
                  ...defaults,
                  callouts: [],
                })),
              })
            }
          >
            {t("video.storyboard.create")}
          </button>
        )}
        {draft?.chapters.map((chapter, chapterIndex) => (
          <fieldset key={chapter.chapterId} className="video-panel-fields">
            <legend>{board.script?.chapters[chapterIndex].title}</legend>
            <ChapterChoice
              label="video.storyboard.metaphor"
              choices={
                Object.keys(
                  storyboardMetaphors,
                ) as StoryboardChapter["visualMetaphor"][]
              }
              labels={metaphorLabels}
              value={chapter.visualMetaphor}
              onChange={(visualMetaphor) =>
                patchChapter(chapterIndex, {
                  visualMetaphor,
                  ...(visualMetaphor === "voice-rails"
                    ? { cameraPresetId: "static" }
                    : {}),
                })
              }
            />
            <ChapterChoice
              label="video.panel.options.mood"
              choices={storyboardMoods}
              labels={moodLabels}
              value={chapter.mood}
              onChange={(mood) => patchChapter(chapterIndex, { mood })}
            />
            <ChapterChoice
              label="video.studio3d.palette"
              choices={paletteIds}
              labels={paletteLabels}
              value={chapter.paletteId}
              onChange={(paletteId) =>
                patchChapter(chapterIndex, { paletteId })
              }
            />
            <ChapterChoice
              label="video.studio3d.camera"
              choices={
                Object.keys(
                  cameraLabels,
                ) as StoryboardChapter["cameraPresetId"][]
              }
              labels={cameraLabels}
              value={chapter.cameraPresetId}
              disabled={chapter.visualMetaphor === "voice-rails"}
              onChange={(cameraPresetId) =>
                patchChapter(chapterIndex, { cameraPresetId })
              }
            />
            {chapter.callouts.map((callout, index) => {
              const patchCallout = (patch: Partial<typeof callout>) =>
                patchChapter(chapterIndex, {
                  callouts: chapter.callouts.map((item, i) =>
                    i === index ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <div className="video-panel-fields" key={index}>
                  <label className="field">
                    {t("video.storyboard.callout")}
                    <input
                      maxLength={160}
                      value={callout.text}
                      onChange={(event) =>
                        patchCallout({ text: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    {t("video.storyboard.position")}
                    <input
                      type="number"
                      min={0}
                      max={maxCalloutPercent}
                      step={1}
                      value={
                        Number.isNaN(callout.afterPercent)
                          ? ""
                          : callout.afterPercent
                      }
                      onChange={(event) =>
                        patchCallout({
                          afterPercent: event.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                  <button
                    className="outline"
                    type="button"
                    onClick={() =>
                      patchChapter(chapterIndex, {
                        callouts: chapter.callouts.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    {t("video.storyboard.removeCallout")}
                  </button>
                </div>
              );
            })}
            <button
              className="outline"
              type="button"
              disabled={chapter.callouts.length >= maxStoryboardCallouts}
              onClick={() => {
                const previous = chapter.callouts.at(-1)?.afterPercent ?? -1;
                patchChapter(chapterIndex, {
                  callouts: [
                    ...chapter.callouts,
                    {
                      text: "",
                      afterPercent: Math.min(maxCalloutPercent, previous + 20),
                    },
                  ],
                });
              }}
            >
              {t("video.storyboard.addCallout")}
            </button>
          </fieldset>
        ))}
        {draft && (
          <div className="video-panel-actions">
            <button
              className="outline"
              type="button"
              disabled={!editing || conflict}
              onClick={() => void save("draft")}
            >
              {t("video.storyboard.save")}
            </button>
            <button
              className="primary"
              type="button"
              disabled={conflict || sameStoryboard(draft, applied)}
              onClick={() => void save("apply")}
            >
              {t("video.storyboard.apply")}
            </button>
            {editing && (
              <button
                type="button"
                className="outline"
                onClick={() => {
                  setLocal(undefined);
                  setStatus(undefined);
                }}
              >
                {t("video.storyboard.discard")}
              </button>
            )}
            {applied && (
              <button
                type="button"
                className="outline"
                disabled={!!editing}
                onClick={() => void save("remove")}
              >
                {t("video.storyboard.remove")}
              </button>
            )}
          </div>
        )}
      </fieldset>
      <div className="video-panel-status" role="status">
        {board.failed
          ? t("video.storyboard.failed")
          : conflict
            ? t("video.storyboard.conflict")
            : notices
              ? t(notices)
              : ""}
      </div>
    </details>
  );
}
