import assert from "node:assert/strict";
import test from "node:test";
import {
  loadedCaptionCues,
  loadedVideoDimensions,
} from "./fixtures/video-preview.ts";

test("preview dimensions require loaded media metadata", () => {
  const video = {
    HAVE_METADATA: 1,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    error: null,
  };
  assert.equal(loadedVideoDimensions(video), null);

  video.readyState = video.HAVE_METADATA;
  video.videoWidth = 1080;
  video.videoHeight = 1920;
  assert.deepEqual(loadedVideoDimensions(video), [1080, 1920]);

  video.error = { code: 4 };
  assert.throws(() => loadedVideoDimensions(video), /preview failed to load/);
});

test("preview cues stay pending until the caption track finishes loading", () => {
  let track = null;
  const cues = [];
  const video = {
    querySelector: () => track,
    textTracks: [{ cues }],
  };
  assert.equal(loadedCaptionCues(video), null);

  track = { LOADED: 2, ERROR: 3, readyState: 1 };
  cues.push({ id: "1", startTime: 0, endTime: 0.751, text: "Host A: First" });
  assert.equal(loadedCaptionCues(video), null);
  cues.push({
    id: "2",
    startTime: 0.751,
    endTime: 1.5,
    text: "Host A: Next\nline",
  });
  track.readyState = track.LOADED;
  assert.deepEqual(loadedCaptionCues(video), [
    ["1", 0, 751, "Host A: First"],
    ["2", 751, 1500, "Host A: Next\nline"],
  ]);

  track.readyState = track.ERROR;
  assert.throws(() => loadedCaptionCues(video), /track failed to load/);
});
