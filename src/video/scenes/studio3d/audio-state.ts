import { designTokens } from "../../design/tokens.ts";
import {
  mapPcmWindow,
  memoryPcmSource,
  type PcmSource,
  type PcmWindow,
} from "../../pcm-source.ts";
import { frameEnvelope, turnSampleRange, type PcmAudio } from "../../pcm.ts";
import type { TimelinePlan, VideoTurn } from "../../timeline.ts";

export const spectrumBins = 32;
const windowSeconds = 0.04;

export function analysisWindowSize(sampleRate: number) {
  return Math.max(1, Math.round(windowSeconds * sampleRate));
}

export function spectrumBandEdges(sampleRate: number) {
  const low = 80;
  const high = Math.min(8000, sampleRate / 2);
  if (high <= low) return [];
  return Array.from({ length: spectrumBins + 1 }, (_, index) =>
    index === spectrumBins
      ? high
      : low * (high / low) ** (index / spectrumBins),
  );
}

function levelInRange(amplitude: number, lowDb: number, highDb: number) {
  return Math.max(
    0,
    Math.min(1, (20 * Math.log10(amplitude) - lowDb) / (highDb - lowDb)),
  );
}

function createAudioAnalyzer(audio: PcmAudio | PcmSource) {
  const sourcePcm =
    "readWindow" in audio ? audio : (audio.source ?? memoryPcmSource(audio));
  const { sampleRate, channels } = sourcePcm;
  const sampleCount =
    "readWindow" in audio || audio.source
      ? sourcePcm.length
      : audio.channels.reduce(
          (count, channel) => Math.min(count, channel.length),
          sourcePcm.length,
        );
  const length = analysisWindowSize(sampleRate);
  const hann = Float64Array.from(
    { length },
    (_, index) =>
      0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, length - 1)),
  );
  const windowGain = hann.reduce((sum, weight) => sum + weight, 0);
  // Zero padding samples the spectrum more densely for the narrow low bands.
  const fftSize = 2 ** Math.ceil(Math.log2(2 * length));
  const nyquistBin = fftSize / 2;
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  const reversed = new Uint32Array(fftSize);
  for (let index = 1; index < fftSize; index++) {
    reversed[index] = (reversed[index >> 1] >> 1) | ((index & 1) * nyquistBin);
  }
  const cosine = Float64Array.from({ length: nyquistBin }, (_, index) =>
    Math.cos((2 * Math.PI * index) / fftSize),
  );
  const sine = Float64Array.from(
    { length: nyquistBin },
    (_, index) => -Math.sin((2 * Math.PI * index) / fftSize),
  );
  const edges = spectrumBandEdges(sampleRate);
  const bands = edges.slice(0, -1).map((low, index) => {
    const high = edges[index + 1];
    return {
      first: Math.ceil((low * fftSize) / sampleRate),
      end: Math.min(
        nyquistBin + 1,
        index === spectrumBins - 1
          ? Math.floor((high * fftSize) / sampleRate) + 1
          : Math.ceil((high * fftSize) / sampleRate),
      ),
      midpoint: (Math.sqrt(low * high) * fftSize) / sampleRate,
    };
  });
  const spectrum = new Float32Array(spectrumBins);
  function fft() {
    for (let width = 2; width <= fftSize; width *= 2) {
      const half = width / 2;
      const stride = fftSize / width;
      for (let offset = 0; offset < fftSize; offset += width) {
        for (let index = 0; index < half; index++) {
          const left = offset + index;
          const right = left + half;
          const c = cosine[index * stride];
          const s = sine[index * stride];
          const re = real[right] * c - imaginary[right] * s;
          const im = real[right] * s + imaginary[right] * c;
          real[right] = real[left] - re;
          imaginary[right] = imaginary[left] - im;
          real[left] += re;
          imaginary[left] += im;
        }
      }
    }
  }

  function binAmplitude(bin: number) {
    const gain = bin === 0 || bin === nyquistBin ? 1 : 2;
    return (gain * Math.hypot(real[bin], imaginary[bin])) / windowGain;
  }

  function analyze(time: number, turn: VideoTurn | undefined) {
    spectrum.fill(0);
    if (!turn || time < turn.start || time >= turn.end)
      return { speaker: null, amplitude: 0, spectrum };

    const { speakerId } = turn;
    const { start, end, source } = turnSampleRange(turn, sampleRate);
    const last = Math.min(sampleCount, source + end - start);
    const center = source + Math.round(time * sampleRate) - start;
    if (center >= last) return { speaker: null, amplitude: 0, spectrum };

    const first = center - Math.floor(length / 2);
    const from = Math.max(0, source - first);
    const to = Math.max(from, Math.min(length, last - first));
    function measure(planes: PcmWindow) {
      let sumSquares = 0;
      let hasSpectrum = false;
      real.fill(0);
      imaginary.fill(0);
      // Bound the centered windows to this turn and zero-pad any uncovered samples.
      for (let index = from; index < to; index++) {
        let mono = 0;
        for (const channel of planes) {
          const sample = channel[index - from];
          mono += sample;
          sumSquares += sample * sample;
        }
        const value = (mono / channels) * hann[index];
        real[reversed[index]] = value;
        hasSpectrum ||= value !== 0;
      }
      if (hasSpectrum && bands.length) {
        fft();
        for (const [index, { first, end, midpoint }] of bands.entries()) {
          let peak = 0;
          for (let bin = first; bin < end; bin++)
            peak = Math.max(peak, binAmplitude(bin));
          if (first >= end) {
            const left = Math.floor(midpoint);
            const fraction = midpoint - left;
            peak =
              binAmplitude(left) * (1 - fraction) +
              binAmplitude(left + 1) * fraction;
          }
          spectrum[index] = levelInRange(peak, -72, -28);
        }
      }
      const rms = Math.sqrt(sumSquares / (length * channels));
      return {
        speaker: speakerId,
        amplitude: levelInRange(rms, -48, -16),
        spectrum,
      };
    }
    return mapPcmWindow(sourcePcm.readWindow(first + from, to - from), measure);
  }

  return analyze;
}

export function audioStateAt(audio: PcmAudio, time: number, turn?: VideoTurn) {
  const state = createAudioAnalyzer(audio)(time, turn);
  if (state instanceof Promise) throw new Error("Expected in-memory PCM");
  return state;
}

export const speakerEmphasisOffset = spectrumBins + 2;
export const envelopeStride = speakerEmphasisOffset + 2;

export function prepareAudioEnvelopes(
  audio: PcmAudio | PcmSource,
  plan: TimelinePlan,
) {
  const { fps, scenes } = plan;
  const frames = Math.ceil(plan.duration * fps);
  const turns = scenes.filter(
    (scene): scene is VideoTurn => scene.kind === "turn",
  );
  const analyze = createAudioAnalyzer(audio);
  const levels = new Float64Array(speakerEmphasisOffset);
  const emphasis = [0, 0];
  const { hostEmphasisMs, orbAttackReleaseMs, spectrumAttackReleaseMs } =
    designTokens.common.motion;
  const emphasisStep = 1000 / (fps * hostEmphasisMs);
  const alpha = (tauMs: number) => 1 - Math.exp(-1000 / (fps * tauMs));
  const [orbAttack, orbRelease] = orbAttackReleaseMs.map(alpha);
  const [spectrumAttack, spectrumRelease] = spectrumAttackReleaseMs.map(alpha);
  let turnIndex = 0;

  return frameEnvelope(
    frames,
    envelopeStride,
    (frame, output) => {
      const time = frame / fps;
      while (turns[turnIndex]?.end <= time) turnIndex++;
      const turn = turns[turnIndex];
      const active = turn && time >= turn.start ? turn.speakerId : null;
      function smooth({
        speaker,
        amplitude,
        spectrum,
      }: Awaited<ReturnType<typeof analyze>>) {
        for (let index = 0; index < levels.length; index++) {
          const target =
            index < 2
              ? speaker === (index === 0 ? "A" : "B")
                ? amplitude
                : 0
              : spectrum[index - 2];
          const attack = index < 2 ? orbAttack : spectrumAttack;
          const release = index < 2 ? orbRelease : spectrumRelease;
          levels[index] +=
            (target - levels[index]) *
            (target > levels[index] ? attack : release);
          output[index] = levels[index];
        }
        for (let index = 0; index < emphasis.length; index++) {
          // The visual cue follows the turn even when PCM is quiet. Reversing a
          // short transition keeps the current emphasis instead of jumping.
          const progress =
            active === (index === 0 ? "A" : "B")
              ? Math.min(1, emphasis[index] + emphasisStep)
              : Math.max(0, emphasis[index] - emphasisStep);
          emphasis[index] = progress;
          output[speakerEmphasisOffset + index] =
            progress * progress * (3 - 2 * progress);
        }
      }
      const state = analyze(time, turn);
      return state instanceof Promise ? state.then(smooth) : smooth(state);
    },
    () => {
      turnIndex = 0;
      levels.fill(0);
      emphasis.fill(0);
    },
  );
}
