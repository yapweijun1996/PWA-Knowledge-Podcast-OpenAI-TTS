import {
  sampleAmplitude,
  sampleSpectrum,
  spectrumBins,
  spectrumWindowSize,
} from "../src/audio-state.js";

export const fps = 30;
export const durationSeconds = 5;
export const frameCount = durationSeconds * fps;
const sampleRate = 48_000;
const speakingSeconds = 0.9;

export function createFixture() {
  const pcm = new Float32Array(durationSeconds * sampleRate);
  const turns = Array.from({ length: durationSeconds }, (_, start) => {
    const speaker = start % 2 === 0 ? "A" : "B";
    const offset = start * sampleRate;
    const samples = pcm.subarray(offset, offset + speakingSeconds * sampleRate);
    const tone = ((speaker === "A" ? 3 : 7) * sampleRate) / spectrumWindowSize;
    for (let index = 0; index < samples.length; index++) {
      const t = index / sampleRate;
      const attack = Math.min(1, t / 0.12);
      const release = Math.min(1, (speakingSeconds - t) / 0.18);
      const envelope =
        attack *
        release *
        (0.46 + 0.3 * Math.sin(2 * Math.PI * (1.25 * t + start / 7)));
      const phase = 2 * Math.PI * tone * t;
      samples[index] =
        envelope *
        (0.73 * Math.sin(phase) +
          0.18 * Math.sin(2 * phase) +
          0.09 * Math.sin(3 * phase));
    }
    return { speaker, samples };
  });
  const silence = new Float32Array(spectrumBins);

  return function stateAt(t) {
    const start = Math.floor(t);
    const turn = turns[start];
    const offset = t - start;
    if (!turn || offset >= speakingSeconds) {
      return { speaker: null, amplitude: 0, spectrum: silence };
    }
    return {
      speaker: turn.speaker,
      amplitude: sampleAmplitude(turn.samples, sampleRate, offset),
      spectrum: sampleSpectrum(turn.samples, sampleRate, offset),
    };
  };
}
