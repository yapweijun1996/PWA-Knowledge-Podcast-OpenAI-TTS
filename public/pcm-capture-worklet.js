// Capture mono PCM without routing audible audio to the speakers.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.port.onmessage = (event) => {
      if (event.data === "start") {
        this.recording = true;
        this.port.postMessage({ type: "ready" });
      } else if (event.data === "stop") {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: "done" });
      }
    };
  }

  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ type: "data", samples }, [samples.buffer]);
    this.used = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!this.recording || !channels?.length || !channels[0]?.length)
      return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels)
        sample += (channel[i] || 0) / channels.length;
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor("podcast-pcm-capture", PcmCaptureProcessor);
