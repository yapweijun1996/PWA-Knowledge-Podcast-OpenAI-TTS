import type { Language } from "../factory.ts";

export const plans: Record<Language, { script: string; audio: string }> = {
  en: {
    script:
      "Natural conversational English, with clear explanations and short turns.",
    audio:
      "Speak in natural conversational English. Keep technical names intelligible.",
  },
  zh: {
    script:
      "Natural spoken Mandarin in Simplified Chinese, using short sentences and Chinese punctuation. Retain proper names where helpful.",
    audio:
      "Speak clear natural Mandarin, preserving foreign proper names and the original wording.",
  },
  ms: {
    script:
      "Natural Bahasa Melayu for Malay-speaking listeners in Singapore and Malaysia. Prefer idiomatic Malay and avoid Indonesian substitutions.",
    audio:
      "Speak clear Bahasa Melayu with natural Malay pronunciation. Preserve names and original wording.",
  },
  sg: {
    script:
      "Use conversational Singapore English as a base. Mix in brief idiomatic Mandarin and Bahasa Melayu where natural. Across the episode use all three languages, and give context so the audience can follow. Keep switching purposeful, avoid caricature and token particles.",
    audio:
      "Speak naturally for a Singapore audience. Follow the script's English, Mandarin and Bahasa Melayu code-switches without translating. Shift pronunciation with the words. Avoid exaggerated accents.",
  },
};
