# PACT Demo Video — Production Report

**Prepared:** November 12, 2026  
**Status:** Final master encoded and verified  
**Application:** PACT — The Permission Layer for AI Payments  
**Capture origin:** `http://localhost:3000` (local Next.js app, PostgreSQL-backed prepared account)

---

## 1. Deliverables

| Deliverable | Path | Technical result |
| --- | --- | --- |
| Final demo video | `submission/PACT_Hackathon_Demo.mp4` | 184.5 s (3:04.5), 1920×1080, 30 fps, H.264 High, AAC-LC stereo, embedded English subtitles, 14,899,456 bytes |
| Voiceover track | `submission/PACT_Voiceover.mp3` | 180.1 s, MP3, 48 kHz stereo, 192 kbps |
| English subtitles | `submission/PACT_Hackathon_Demo.srt` | 52 cues, 0:02.700–3:01.480; also embedded as `mov_text` |
| Thumbnail | `submission/PACT_Demo_Thumbnail.png` | 1920×1080 PNG, built from an actual Security Center frame |
| Production report | `submission/VIDEO_PRODUCTION_REPORT.md` | This document |
| README credits | `README.md` → **Demo Video & AI Production Credits** | Exact tools, versions, links and task split |

---

## 2. Actual tools and versions

| Task | Tool / model | Version | Official site |
| --- | --- | --- | --- |
| Screen recording | Playwright / Chromium | 1.64.1 | <https://playwright.dev/> |
| Browser automation | Node.js + Playwright API | Node 24.18.0 | <https://nodejs.org/> |
| AI voiceover | Microsoft Edge Neural TTS voice `en-US-ChristopherNeural`, accessed through `edge-tts` | edge-tts 7.3.1 | <https://github.com/rany2/edge-tts> |
| AI video generation | **None** | — | — |
| AI image generation | **None** | — | — |
| Video editing and encoding | FFmpeg | 9.0.2-full_build-www.gyan.dev | <https://ffmpeg.org/> |
| Subtitle authoring and remux | Python + FFmpeg | Python 3.11.9, FFmpeg 9.0.2 | <https://www.python.org/> / <https://ffmpeg.org/> |
| Title cards, lower thirds, thumbnail | Pillow | 12.3.0 | <https://python-pillow.org/> |
| Asset/build scripting | Python | 3.11.9 | <https://www.python.org/> |
| Local app runtime | Next.js application already present in the workspace | Project dependencies | — |

**Voice details:** English, `en-US-ChristopherNeural`, rate `+18%`, 14 narration segments, approximately 435 words. The voice track was normalized in the source deliverable and mixed under the final master. No voice cloning and no other TTS model were used.

**Fonts:** Segoe UI Semibold, Segoe UI and Consolas from the local Windows installation. No licensed display font was added.

**AI/non-AI split:** The narration is the only AI-generated media asset. The screen recording, application data, title cards, lower thirds, thumbnail composition and edit are conventional screen capture and deterministic software production. The English subtitles were curated from the recorded narration script; they are not AI-transcribed. No AI video-generation model, AI image model, stock footage or licensed music track was used.

**Ambient bed:** Synthesized locally with FFmpeg from 55 Hz, 82.41 Hz and 110 Hz sine waves plus filtered pink noise, held well below the narration. It is an original signal-synthesis bed, not a licensed track and not an AI music model.

---

## 3. What was captured

The master is a real recording of the prepared local account, not a mockup or a slideshow.

- The dashboard, mandates, agent identity, Payment Center, Transaction Ledger, Security Center, Security Intelligence, Delegation Graph, Audit & Compliance and Payment Center PayPal status are the actual application routes.
- The signed mandate shown is **Northline equipment renewal mandate** (`mnd_heRudwb0pTcU`), with the real scope and limits visible in the UI.
- The agent is **ProcureMaster-Root**, with its actual Ed25519 public identity and mandate binding.
- The recorded proposal is the real **$38.00 Northline Supply Co.** catalog purchase. PACT authorized it, reserved `$38.00` atomically, and recorded **17/17 checks passed**. The trace shows **PayPal approval: not started** and **verified capture: not captured**.
- The recorded blocked proposal is the real **$40.00 Lambda Labs** budget-exhaustion decision (`dec_5cjwQm-QlUdq`). The UI shows **16 passed, 1 failed**, and **no transaction created**.
- The Security Center run shows **8/8 boundaries held** and **0 failures**.
- The Delegation Graph shows the child mandate selected and the **delegated authority containment** result, including the revoked-parent withdrawal state.
- The Audit & Compliance page shows **100% chain integrity**, **0 signature failures**, and the real linked-record count at capture time.
- The PayPal section shows the real **PayPal sandbox credentials are not configured** text and **PayPal approval: not started / verified capture: not captured**.

### Data changes caused by the recording

The recording used the real UI and therefore changed local application data:

- a new **$38.00 authorized** proposal was created;
- a new **$40.00 blocked** proposal was created;
- dashboard counts, remaining budget and audit counts changed during the take.

No application source or functionality was modified for the video.

---

## 4. PayPal and audit boundaries

This report intentionally distinguishes PACT authorization from payment processing.

- **No PayPal Sandbox credentials were configured.**
- **No PayPal approval, order creation, checkout, capture, settlement, webhook verification, or live Sandbox verification was executed or claimed.**
- The final video never presents PACT authorization as a completed payment.
- The dashboard's legacy **`$80.00 captured via PayPal`** figure is local application data in the prepared account. It is not presented as live PayPal Sandbox evidence. The video's Payment Center section explicitly says no PayPal Sandbox credentials exist and that the loopback contract test proves the adapter, not a genuine Sandbox transaction.
- The audit page is **hash-chained, signed application evidence**, not immutable storage. The narration says this explicitly.
- No Revoke, Suspend, Delegate, Execute-against-live-engine, PayPal checkout, or Create PayPal order action was clicked during the recording.

---

## 5. Timeline and synchronization

| Section | Final master start | Narration / on-screen content |
| --- | --- | --- |
| Opening title card | 0:00.0 | PACT identity card; ambient bed only |
| Live app / opening narration | 0:02.0 / 0:02.7 | Dashboard; “An AI agent can choose what to buy…” |
| The authority gap | 0:12.1 | Problem statement, still on real dashboard |
| The PACT model | 0:24.4 | Signed-mandate model |
| Control plane | 0:35.9 | Live dashboard and persisted state |
| Signed mandate | 0:47.0 | Northline mandate, scope, Ed25519 proof |
| Agent identity | 1:03.5 | ProcureMaster-Root and public identity |
| Authorized purchase | 1:16.2 | Real $38 proposal, 17 checks, atomic budget reservation |
| Authorization trace | 1:34.8 | Proposal → budget hold → checks; PayPal not started |
| Security boundaries | 1:45.1 | 8/8 held, 0 failures |
| Blocked spend | 1:58.7 | $40 decision rejected by remaining budget |
| Delegation containment | 2:11.3 | Child mandate / revoked-parent containment |
| Audit evidence | 2:23.0 | 100% integrity, 0 signature failures |
| PayPal status | 2:35.7 | Not configured; no live capture claimed |
| Closing | 2:49.6 | Dashboard close and value statement |
| Closing card | 3:02.1 | Dark closing card; no PayPal execution statement |

**Edit structure:** 2.0 s title card + 180.1 s live-app main + 2.4 s closing card = **184.5 s**. The voiceover file starts with a 0.7 s lead and was delayed by the 2.0 s title card, so narration begins at **0:02.7** and ends at **3:02.1**, exactly when the closing card begins.

The live interaction cues were advanced so the relevant screen is already present when the narration starts. Lower thirds appear for roughly four seconds at the start of each major section, with a 0.35 s alpha fade.

**Subtitles:** the embedded English track has 52 curated cues, starts at 0:02.700 and ends at 3:01.480. Each cue is at most two lines and 48 characters per line. It is a soft `mov_text` track, not burned into the picture; the video and audio streams were copied unchanged. The sidecar SRT is the same track.

---

## 6. Editing pipeline

1. **Live verification.** The app was already running at `http://localhost:3000`; the prepared local account could reach the dashboard and all required routes.
2. **Recording.** `production/record.mjs` used Playwright 1.64.1 with the saved storage state, a 1440×810 viewport, a custom teal cursor and real clicks/typing. It created the $38 proposal and the $40 blocked proposal through the actual UI. It did not touch dangerous actions.
3. **Raw capture.** The browser produced a 182.36 s, 25 fps, 1440×810 WebM. The first 1.199 s of load/startup was trimmed, leaving 180.1 s of main footage.
4. **Voiceover.** `edge-tts` generated 14 segments as MP3. They were assembled into `submission/PACT_Voiceover.mp3` (180.1 s). The earlier Andrew voice failed with `NoAudioReceived` on one segment; the final narration uses Christopher, which completed all 14 segments.
5. **Graphics.** `production/make_assets.py` used Pillow to render the 1920×1080 title card, closing card, 10 lower thirds and the thumbnail. The thumbnail background and closing background are actual captured frames, not generated imagery.
6. **Edit.** `production/build_video.py` used FFmpeg to:
   - trim the capture;
   - scale 1440×810 → 1920×1080 with Lanczos;
   - conform 25 fps → 30 fps;
   - add the lower thirds with alpha fades;
   - concatenate title card, main footage and closing card;
   - synthesize and mix the ambient bed;
   - delay the voiceover by 2.0 s to match the title card;
   - encode H.264 High / yuv420p and AAC-LC 48 kHz stereo with `+faststart`.
7. **Subtitles.** `production/make_subtitles.py` generated a curated 52-cue English SRT from `production/timeline.json`. The final master was remuxed with `-c:v copy -c:a copy -c:s mov_text`; video/audio stream hashes were identical before and after, and the embedded cues extracted back to the same SRT timings and text.
8. **Verification.** The final master was probed and fully decoded; frames across every section were reviewed; audio levels and credential exposure were checked.

---

## 7. Final technical verification

### Container and streams

- **Format:** MP4 / `mov,mp4,m4a,3gp,3g2,mj2`
- **Duration:** `184.500000` s
- **Size:** `14,899,456` bytes
- **Overall bitrate:** `646,046` bps
- **Video:** H.264 High, 1920×1080, `yuv420p`, 30/1 fps, average 30/1 fps, ~445,284 bps
- **Audio:** AAC-LC, 48,000 Hz, 2 channels, ~191,680 bps
- **Subtitles:** `mov_text`, English (`eng`), 52 cues, ~126 bps, default disposition
- **Fast start:** enabled

### Playability and stream preservation

`ffmpeg -v error -i submission/PACT_Hackathon_Demo.mp4 -f null -` completed with **exit 0** and no decode errors.

The video and audio stream hashes were identical before and after the subtitle mux:

- Video: `ac8e6f0c9e8bc62d153c41a2bd7428a0`
- Audio: `35cdd640c44e6b76caa4ef48e2583b0f`

This is the direct proof that the footage, narration and lower thirds were not re-encoded by the subtitle step. Extracting stream 2 back to SRT produced the same 52 cues, timings and text as the sidecar file.

### Audio

- Mean volume: **−19.5 dB**
- Peak: **−1.1 dB**
- No clipping detected by `volumedetect`; the limiter ceiling was 0.95.
- Narration begins at 0:02.7 and ends at 3:02.1.
- The ambient bed is present but intentionally low; no licensed track was used.

### Visual review

Frames were extracted and inspected at approximately: 0:01.0, 0:03.2, 0:36.3, 0:47.5, 1:18.4, 1:36.0, 1:46.6, 2:00.7, 2:13.3, 2:25.5, 2:37.2, 2:50.8, 3:02.6 and 3:03.6. The review confirmed:

- title card and readable opening;
- real dashboard and mandate detail;
- real $38 authorized proposal, 17 checks and atomic budget reservation;
- trace with PayPal approval not started and capture not captured;
- Security Center 8/8 held, 0 failures;
- blocked $40 decision with 16 passed / 1 failed;
- delegation containment/graph;
- audit integrity 100% / 0 signature failures;
- PayPal not-configured notice;
- readable lower thirds and closing card.

No password, API key, `.env` value, session secret or prepared-account credential file appears in the deliverables.

---

## 8. Known limitations

1. **PayPal is unverified in this environment.** There were no genuine PayPal Sandbox credentials or public HTTPS origin. No live approval, order, capture, settlement, webhook, or Sandbox verification was performed. This is stated in the video and README.
2. **Source resolution.** The real browser capture was 1440×810 and was upscaled to 1920×1080; it is not native 1080p capture. The source was 25 fps and was conformed to 30 fps.
3. **Application data is live local test data.** The recording created a real $38 authorized proposal and a $40 blocked proposal. Dashboard totals and audit counts changed during the take. The dashboard's `$80.00 captured via PayPal` figure is local application data, not live PayPal evidence.
4. **Audit is application evidence.** The hash chain is genuine application behavior, but the project does not claim immutable storage at rest.
5. **No AI video generation.** Only the narration is AI-generated. The moving footage is a real screen recording.
6. **No licensed music.** The ambient bed is a low-volume FFmpeg synthesis; the production does not claim a licensed soundtrack.
7. **Subtitles are a soft track, not burned in.** The English `mov_text` track is selectable/default; lower thirds remain unchanged. A player that displays subtitles near the bottom may place them over lower-third graphics during those four-second sections; captions can be toggled off in the player.

---

## 9. Reproducibility files

- `production/record.mjs` — real Playwright capture and interaction script.
- `production/timeline.json` — narration section starts/durations.
- `production/audio/segments.json` — 14 narration texts.
- `production/make_assets.py` — title card, closing card, lower thirds and thumbnail.
- `production/build_video.py` — FFmpeg edit/mix/encode pipeline.
- `production/make_subtitles.py` — curated 52-cue SRT and subtitle timing.
- `production/pre_subtitle_hashes.txt` / `production/post_subtitle_hashes.txt` — video/audio stream-preservation evidence.
- `production/extracted_subtitles.srt` — embedded subtitle extraction used for verification.
- `production/overlays/` — rendered 1920×1080 graphic assets.
- `production/raw/` — raw browser capture.
- `production/build.log` — build command log.
- `production/final2/` — verification frames.
- `submission/PACT_Hackathon_Demo.mp4` — final master with embedded English subtitles.
- `submission/PACT_Hackathon_Demo.srt` — sidecar English subtitles.
- `submission/PACT_Voiceover.mp3` — narration track.
- `submission/PACT_Demo_Thumbnail.png` — thumbnail.
