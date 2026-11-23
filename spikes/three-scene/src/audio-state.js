export const spectrumBins = 32;
export const spectrumWindowSize = 512;

const halfPeakWindowSeconds = 0.24;
const tau = 2 * Math.PI;
const hann = Float64Array.from(
  { length: spectrumWindowSize },
  (_, index) => 0.5 - 0.5 * Math.cos((tau * index) / (spectrumWindowSize - 1)),
);
const spectrumScale = 2 / hann.reduce((sum, weight) => sum + weight, 0);
const sine = Float64Array.from({ length: spectrumWindowSize }, (_, index) =>
  Math.sin((tau * index) / spectrumWindowSize),
);

/** Center the same 480 ms peak window used by the Canvas 2D waveform. */
export function sampleAmplitude(pcm, sampleRate, t) {
  const from = Math.max(
    0,
    Math.round((t - halfPeakWindowSeconds) * sampleRate),
  );
  const to = Math.min(
    pcm.length,
    Math.round((t + halfPeakWindowSeconds) * sampleRate),
  );
  let peak = 0;
  for (let index = from; index < to; index++) {
    peak = Math.max(peak, Math.abs(pcm[index]));
  }
  return Math.min(1, peak);
}

/** Center a Hann-windowed DFT on t. Output index 0 is the first bin above DC. */
export function sampleSpectrum(pcm, sampleRate, t) {
  const first = Math.round(t * sampleRate) - spectrumWindowSize / 2;
  const window = Float64Array.from(
    hann,
    (weight, index) => (pcm[first + index] ?? 0) * weight,
  );
  const spectrum = new Float32Array(spectrumBins);
  for (let bin = 1; bin <= spectrumBins; bin++) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < spectrumWindowSize; index++) {
      const phase = (bin * index) % spectrumWindowSize;
      const cosinePhase = (phase + spectrumWindowSize / 4) % spectrumWindowSize;
      real += window[index] * sine[cosinePhase];
      imaginary -= window[index] * sine[phase];
    }
    spectrum[bin - 1] = Math.min(
      1,
      Math.hypot(real, imaginary) * spectrumScale,
    );
  }
  return spectrum;
}
