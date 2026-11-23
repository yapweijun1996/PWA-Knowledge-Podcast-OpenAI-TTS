import { sampleAmplitude, turnSampleRange, type PcmAudio } from "../../pcm.ts";
import type { VideoTurn } from "../../timeline.ts";

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

export function audioStateAt(audio: PcmAudio, time: number, turn: VideoTurn) {
  const spectrum = new Float32Array(spectrumBins);
  const { sampleRate, channels } = audio;
  const { start, end, source } = turnSampleRange(turn, sampleRate);
  const last = Math.min(channels[0]?.length ?? 0, source + end - start);
  const center = source + time * sampleRate - start;
  if (time < turn.start || time >= turn.end || last <= source || center >= last)
    return { speaker: null, amplitude: 0, spectrum };

  // Use the waveform's centered peak window, bounded by the voiced turn.
  const halfPeak = halfPeakWindowSeconds * sampleRate;
  const from = Math.max(source, Math.round(center - halfPeak));
  const to = Math.min(last, Math.round(center + halfPeak));
  let peak = 0;
  for (const channel of channels) {
    for (let index = from; index < to; index++) {
      const amplitude = Math.abs(sampleAmplitude(channel, index));
      if (amplitude > peak) peak = amplitude;
    }
  }

  // Downmix to mono and zero-pad outside this turn. Bin 0 is just above DC.
  const first = Math.round(center) - spectrumWindowSize / 2;
  const window = new Float64Array(spectrumWindowSize);
  for (
    let index = Math.max(0, source - first);
    index < Math.min(spectrumWindowSize, last - first);
    index++
  ) {
    let sum = 0;
    for (const channel of channels)
      sum += sampleAmplitude(channel, first + index);
    window[index] = (sum / channels.length) * hann[index];
  }
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
  return { speaker: turn.speakerId, amplitude: Math.min(1, peak), spectrum };
}
