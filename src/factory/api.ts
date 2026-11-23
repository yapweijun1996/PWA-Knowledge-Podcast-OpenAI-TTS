import { limits, studioAPI } from "../../shared/factory.ts";
import {
  createTranslator,
  defaultLocale,
  t,
  type Locale,
  type MessageKey,
} from "../i18n/index.ts";
import { safeErrorMessage, translateError } from "../i18n/errors.ts";

export class LibraryError extends Error {
  declare readonly key: MessageKey;

  constructor(key: MessageKey) {
    super(t(key));
    this.key = key;
  }
}

// Keep translating exact source messages from older worker versions.
const sourceT = createTranslator(defaultLocale);
const publicErrorKeys = [
  "library.error.preferences",
  "library.error.scriptChanged",
  "library.error.scriptTitleAndVoices",
  "library.error.backupMissingAudio",
  "library.error.backupTooLarge",
  "library.error.backupInvalid",
  "library.error.recordInvalid",
  "library.error.audioSize",
  "library.error.wavInvalid",
  "library.error.mp3Invalid",
  "library.worker.fileNotFound",
  "library.worker.bodyTooLong",
  "library.worker.jsonRequired",
  "library.worker.jsonInvalid",
  "library.worker.discoveryBusy",
  "library.worker.pathInvalid",
  "library.worker.loginRequired",
  "library.worker.discoveryConsent",
  "library.worker.hostChoice",
  "library.worker.routeMissing",
  "library.worker.transcriptionConsent",
  "library.worker.localVersionInvalid",
  "library.worker.backupRequired",
  "library.worker.keyRequired",
  "library.worker.syncBusy",
  "library.worker.backupInvalid",
  "library.worker.finishedAudioMissing",
  "library.worker.methodUnsupported",
  "library.worker.storageFailed",
  "library.worker.hostMismatch",
  "library.worker.workspaceRequired",
  "library.worker.originMismatch",
  "library.worker.localMode",
  "library.worker.loginRateLimited",
  "library.worker.tokenIncorrect",
  "library.worker.keyBusy",
  "library.worker.scheduleConsent",
  "library.worker.keyInvalid",
  "library.worker.jobActive",
  "library.worker.scriptChanged",
  "library.worker.jobUnknown",
  "library.worker.environmentKeyRequired",
  "library.worker.productionConsent",
  "library.worker.episodeBusy",
  "library.worker.stageUnavailable",
  "library.worker.topicInvalid",
  "library.worker.idUsed",
  "library.worker.alreadyAccepted",
  "library.worker.audioChanged",
  "library.worker.currentAudioRequired",
  "library.worker.checkpointChanged",
  "library.worker.stagingFull",
  "library.worker.scriptInvalid",
  "library.worker.scriptNotReady",
  "library.worker.requestAccepted",
  "library.worker.checkpointResubmit",
  "library.worker.handoffUnavailable",
  "library.worker.clipMissing",
  "library.worker.episodeMissing",
  "library.worker.audioMissing",
  "library.worker.assetNameInvalid",
] as const satisfies readonly MessageKey[];
type ErrorMessage = (translate: typeof t) => string;
const publicErrorMessages = new Map<string, ErrorMessage>(
  publicErrorKeys.map((key) => [sourceT(key), (translate) => translate(key)]),
);

// The validators print ungrouped limits in the source text.
const limitMessages = [
  [
    "library.error.turnLength",
    { count: limits.turn, maximum: String(limits.turn) },
  ],
  [
    "library.error.scriptLength",
    { count: limits.script, maximum: String(limits.script) },
  ],
  ["library.worker.episodeLimit", { count: limits.projects }],
  ["library.worker.discoveryUnavailable", { dayHours: 24, weekDays: 7 }],
] as const;
for (const [key, vars] of limitMessages) {
  publicErrorMessages.set(sourceT(key, vars), (translate) => translate(key, vars));
}

export function localizePublicError(message: string, translate: typeof t) {
  return publicErrorMessages.get(message)?.(translate);
}

export class StudioError extends LibraryError {
  declare readonly status: number;
  declare readonly detail?: string;
  declare readonly code?: string;
  declare readonly params?: unknown;

  constructor(
    key: MessageKey,
    status: number,
    detail?: string,
    code?: string,
    params?: unknown,
  ) {
    super(key);
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.params = params;
    if (code)
      this.message = translateError({
        code,
        params,
        message: detail ?? this.message,
      });
    else if (detail)
      this.message = localizePublicError(detail, t) ?? this.message;
  }

  localized(translate: typeof t, locale: Locale) {
    const { detail } = this;
    if (this.code)
      return translateError(
        {
          code: this.code,
          params: this.params,
          message: detail ?? translate(this.key),
        },
        translate,
      );
    if (!detail) return translate(this.key);
    return (
      localizePublicError(detail, translate) ??
      (locale === defaultLocale
        ? translate("library.api.workerDetail", { detail })
        : translate(this.key))
    );
  }
}

export async function studio<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  requestHeaders?: Record<string, string>,
): Promise<T> {
  const upload = body instanceof Blob;
  const timeout = AbortSignal.timeout(
    upload ? 600_000 : signal ? 60_000 : 15_000,
  );
  const response = await fetch(studioAPI + path, {
    method,
    body: upload ? body : JSON.stringify(body),
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": upload ? body.type : "application/json" }),
      ...requestHeaders,
    },
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => {
    signal?.throwIfAborted();
    throw new StudioError("library.api.connectionFailed", 0);
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new StudioError("library.api.noWorker", 0);
  const payload = await response.json().catch(() => {
    throw new StudioError("library.api.requestFailed", response.status);
  });
  if (!response.ok) {
    throw new StudioError(
      "library.api.requestFailed",
      response.status,
      safeErrorMessage(payload?.error),
      typeof payload?.code === "string" ? payload.code : undefined,
      payload?.params,
    );
  }
  return payload as T;
}

export const media = (id: string, path: string, asset: string) =>
  `${studioAPI}/episodes/${id}/${path}?asset=${encodeURIComponent(asset)}`;
