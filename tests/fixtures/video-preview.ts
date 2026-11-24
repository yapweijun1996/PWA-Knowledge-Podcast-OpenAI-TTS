export function loadedVideoDimensions(element: Element) {
  const video = element as HTMLVideoElement;
  if (video.error) throw new Error("Video preview failed to load");
  if (video.readyState < video.HAVE_METADATA) return null;
  return [video.videoWidth, video.videoHeight];
}

export function loadedCaptionCues(element: Element) {
  const video = element as HTMLVideoElement;
  const track = video.querySelector("track");
  if (!track) return null;
  if (track.readyState === track.ERROR)
    throw new Error("Preview caption track failed to load");
  if (track.readyState !== track.LOADED) return null;
  const cues = video.textTracks[0]?.cues;
  if (!cues) return null;
  return Array.from(cues, (cue) => [
    cue.id,
    Math.round(cue.startTime * 1000),
    Math.round(cue.endTime * 1000),
    (cue as VTTCue).text,
  ]);
}
