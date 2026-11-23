import zhCommon from "./locales/zh-CN/common.ts";
import zhShell from "./locales/zh-CN/shell.ts";
import zhSettings from "./locales/zh-CN/settings.ts";
import zhStudio from "./locales/zh-CN/studio.ts";
import zhLibrary from "./locales/zh-CN/library.ts";
import zhEpisode from "./locales/zh-CN/episode.ts";
import zhPlayback from "./locales/zh-CN/playback.ts";
import zhErrors from "./locales/zh-CN/errors.ts";
import zhAgent from "./locales/zh-CN/agent.ts";
import zhPublish from "./locales/zh-CN/publish.ts";
import zhVideo from "./locales/zh-CN/video.ts";
import enCommon from "./locales/en/common.ts";
import enShell from "./locales/en/shell.ts";
import enSettings from "./locales/en/settings.ts";
import enStudio from "./locales/en/studio.ts";
import enLibrary from "./locales/en/library.ts";
import enEpisode from "./locales/en/episode.ts";
import enPlayback from "./locales/en/playback.ts";
import enErrors from "./locales/en/errors.ts";
import enAgent from "./locales/en/agent.ts";
import enPublish from "./locales/en/publish.ts";
import enVideo from "./locales/en/video.ts";
import msCommon from "./locales/ms/common.ts";
import msShell from "./locales/ms/shell.ts";
import msSettings from "./locales/ms/settings.ts";
import msStudio from "./locales/ms/studio.ts";
import msLibrary from "./locales/ms/library.ts";
import msEpisode from "./locales/ms/episode.ts";
import msPlayback from "./locales/ms/playback.ts";
import msErrors from "./locales/ms/errors.ts";
import msAgent from "./locales/ms/agent.ts";
import msPublish from "./locales/ms/publish.ts";
import msVideo from "./locales/ms/video.ts";

export type Message =
  | string
  | (Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & {
      readonly other: string;
    });
type Entry = readonly [key: string, message: Message];

export const catalogueEntries = {
  "zh-CN": [
    ...zhCommon,
    ...zhShell,
    ...zhSettings,
    ...zhStudio,
    ...zhLibrary,
    ...zhEpisode,
    ...zhPlayback,
    ...zhErrors,
    ...zhAgent,
    ...zhPublish,
    ...zhVideo,
  ],
  en: [
    ...enCommon,
    ...enShell,
    ...enSettings,
    ...enStudio,
    ...enLibrary,
    ...enEpisode,
    ...enPlayback,
    ...enErrors,
    ...enAgent,
    ...enPublish,
    ...enVideo,
  ],
  ms: [
    ...msCommon,
    ...msShell,
    ...msSettings,
    ...msStudio,
    ...msLibrary,
    ...msEpisode,
    ...msPlayback,
    ...msErrors,
    ...msAgent,
    ...msPublish,
    ...msVideo,
  ],
} as const satisfies Record<string, readonly Entry[]>;

export type Locale = keyof typeof catalogueEntries;
export type MessageKey = (typeof catalogueEntries)["zh-CN"][number][0];

export const defaultLocale = "zh-CN";
export const locales = Object.keys(catalogueEntries) as Locale[];

export type Catalogues = Partial<
  Record<Locale, Readonly<Record<string, Message>>>
>;
export const catalogues: Catalogues = Object.fromEntries(
  locales.map((locale) => [
    locale,
    Object.fromEntries(catalogueEntries[locale]),
  ]),
);
