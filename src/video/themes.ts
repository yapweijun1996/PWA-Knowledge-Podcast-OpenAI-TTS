export const videoThemes = {
  dark: {
    background: "#101826",
    panel: "#1A283A",
    text: "#F1F6FC",
    accent: "#83E2CE",
    baseline: "#436574",
  },
  light: {
    background: "#F5F1E7",
    panel: "#EBE4D7",
    text: "#222B32",
    accent: "#176B5D",
    baseline: "#96AFA4",
  },
} as const;

export type VideoTheme = keyof typeof videoThemes;
