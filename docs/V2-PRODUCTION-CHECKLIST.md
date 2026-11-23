# V2 episode production checklist

Copy the per-episode checklist into the episode's private production notes. Record the evidence beside each check. Reopen the affected checks whenever the script, audio or delivery files change.

## Per-episode sign-off

- [ ] **Identify the cut.** Record the episode title, script and audio revisions, language, voice, duration and authorized budget. Confirm that the Library shows audio for the reviewed script revision.
- [ ] **Check the facts.** Trace policy claims, figures, names and exceptions to their sources. Check the research summary, script and listener notes against those sources. Document any superseded claim where it could reach a listener.
- [ ] **Listen for accuracy.** Compare the independent transcript with the script. A fluent speaker listens to the whole cut at normal speed, checks disputed words against the audio and records their timestamps. Correct the transcript for a transcription error. For a spoken error, correct the audio and check the new transcript.
- [ ] **Listen across joins.** Check the opening, every segment boundary and the final sentence. Listen for missing or repeated words, clipped endings, abrupt pauses and changes in voice or level. After a replacement, listen across both adjacent joins.
- [ ] **Verify exported files.** Download the current WAV and, when offered for delivery, the MP3. Open each file in an independent player, compare durations, seek into the middle and listen through the ending. Try the delivery format on the intended listening device and record the filenames.
- [ ] **Owner — approve the video render.** Render the reviewed audio revision. Play the MP4 from start to finish, check waveform and caption alignment, chapter transitions, dimensions, and audio sync after seeking. Record the file hash and codec on the target browser and device. [Renderer](../src/video/render.ts) · [Video evidence](VIDEO-RENDER-DECISION.md)
- [ ] **Owner — verify the publish ZIP.** Extract it and play the included MP4 independently. Check the thumbnail, title, description, tags, sources, chapter offsets starting at 0:00 and AI disclosure against the approved cut. Check manual upload compatibility and intended visibility. [Package builder](../src/publish/package.ts)
- [ ] **Owner — clear publication rights and disclosure.** Confirm that each externally sourced image, clip, music track and sound effect permits the intended YouTube use. Save the licence or permission and add required attribution. Check the manual upload's altered-content setting against the episode and confirm the intended visibility before publishing. [YouTube copyright guidance](https://support.google.com/youtube/answer/2797466) · [YouTube altered content disclosure](https://support.google.com/youtube/answer/14328491)
- [ ] **Owner — verify locale and language.** Check the UI in Simplified Chinese, English and Malay, confirm episode text keeps its language, and review the delivery text in the intended episode language. Record native review of consent, estimates, key exposure and unknown-outcome copy before relying on it for release. [Locale standard](UIUX-STANDARD.md)
- [ ] **Reconcile actual cost.** Total the attributable provider charges for research, scripting, narration, transcription and any retries or regeneration. Record the billing window and compare the total with the authorized budget. If the bill cannot isolate this episode, mark the actual cost unconfirmed and label any estimate separately.
- [ ] **Prove recovery.** Use **备份本期节目** to export a private `.kps`. Import it into a second browser profile as a separate copy. Check sources, corrected script, transcript and playable audio. With the app shell cached there, reload offline and play the restored episode. Record the backup filename and result.
- [ ] **Record the release decision.** Note the reviewer, date, approved filenames and any outstanding issues. After publication, check the listener-facing copy and its notes. Keep the last approved files available in case the wrong revision is distributed.

## Singapore HDB sample review

As of 2026-11-22, the corrected Mandarin cut of 《新加坡组屋怎样住出混合社区》 is **awaiting listening review**. The local Chrome Library received ten narrated segments totaling 2:21. The studio showed WAV and MP3 downloads and reported a 99% script-to-transcript match.

| Item | Evidence and remaining check |
| --- | --- |
| Resale rule | The revised script says a cross-ethnic purchase can be restricted when the **buyer's** ethnic group has reached its block or neighbourhood limit. It retains the qualification for a buyer and seller of the same ethnic group and household citizenship. The saved research summary still contains the earlier wording. Record an erratum before distributing notes or a backup containing that summary. [Gov.sg EIP explanation](https://www.gov.sg/explainers/hdb-ethnic-integration-policy/) · [HDB resale eligibility](https://www.hdb.gov.sg/buying-a-flat/resale-flats/process-for-buying-a-resale-flat/resale-flat-planning/eip-and-spr-quota) |
| SPR quota | The revised script identifies the separate quota for non-Malaysian Singapore permanent resident households. Listen to chapter 1, segment 3 for the full qualifier “非马来西亚籍” and “SPR 配额”. [HDB quota guidance](https://www.hdb.gov.sg/buying-a-flat/resale-flats/process-for-buying-a-resale-flat/resale-flat-planning/eip-and-spr-quota) |
| Disputed words and joins | In chapter 3, segment 3, listen for “买方所属族群” and the scripted “仍可能符合资格”. The transcript rendered the latter as “两可能符合资格”. Record what is audible, then review all nine joins and the ending. |
| Files and recovery | Independent playback of the exported WAV and MP3 and a restore of this cut from its own `.kps` are pending. |
| Cost | The authorized ceiling was US$10 for the episode. The actual cost, including the corrected render, is unconfirmed. |

## When the studio changes

Use the [project production readiness checklist](PRODUCTION-READINESS.md) for deployment, worker operations and rollback. Repeat the checks below for the cut you intend to distribute.

- [ ] Record the app commit and CI run covering the audit, type check, Node tests, strict locale scan, both builds and both configured browser checks. Include the manual WebKit Studio case when checking Library handoff. [CI gate evidence](PRODUCTION-READINESS.md#verify-a-release-candidate)
- [ ] In the target Chrome profile, carry a sample from Studio to the Library. Refresh, select the saved cut and verify that it plays. Use fixtures to exercise worker interruption, failed local saves and repeated handoff. Check that completed work survives and paid retries can be accounted for.
- [ ] Verify the deployed assets and the version seen after a PWA update. Use a synthetic credential when checking logs, backups and cached responses for accidental key exposure. Record the last known working version and how to restore it. [V2 worker and storage runbook](V2-FACTORY.md)
