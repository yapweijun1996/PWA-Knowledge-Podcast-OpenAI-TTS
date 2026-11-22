import {
  defaultPreferences,
  languages,
  type Preferences,
  type ProductionBounds,
} from "./factory.ts";

export function readPreferences(raw: unknown): Preferences {
  const fail = () => {
    throw new Error("请检查主题兴趣、语言或制作上限。");
  };
  if (!raw || typeof raw !== "object") return fail();
  const p = raw as Preferences;
  if (
    typeof p.interests !== "string" ||
    p.interests.length > 1000 ||
    typeof p.enabled !== "boolean" ||
    (p.enabled && !p.interests.trim()) ||
    !["adaptive", "daily", "weekly"].includes(p.cadence) ||
    !Number.isInteger(p.weeklyLimit) ||
    p.weeklyLimit < 1 ||
    p.weeklyLimit > 7 ||
    !Number.isInteger(p.maxHosts) ||
    p.maxHosts < 1 ||
    p.maxHosts > 3 ||
    !Number.isInteger(p.maxSeconds) ||
    p.maxSeconds < 60 ||
    p.maxSeconds > 420 ||
    !Array.isArray(p.allowedLanguages) ||
    !p.allowedLanguages.length ||
    p.allowedLanguages.length > 4 ||
    p.allowedLanguages.some(
      (language) => !Object.hasOwn(languages, language),
    ) ||
    (p.language !== "auto" && !p.allowedLanguages.includes(p.language))
  )
    return fail();
  return {
    interests: p.interests.trim(),
    enabled: p.enabled,
    cadence: p.cadence,
    weeklyLimit: p.weeklyLimit,
    language: p.language,
    allowedLanguages: [...new Set(p.allowedLanguages)],
    maxHosts: p.maxHosts,
    maxSeconds: p.maxSeconds,
  };
}

export function productionBounds(p = defaultPreferences): ProductionBounds {
  const { language, allowedLanguages, maxSeconds, maxHosts } = p;
  return { language, allowedLanguages, maxSeconds, maxHosts };
}
