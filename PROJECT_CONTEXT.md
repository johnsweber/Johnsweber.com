# Johnsweber.com project context

Last updated: 2026-07-29

## Purpose and production

Personal portfolio, resume, and authenticated experiment playground for John
Weber.

- Production: `https://johnsweber.com`
- Alias: `https://www.johnsweber.com`
- GitHub: `johnsweber/Johnsweber.com`
- Production branch/source of truth: `main`
- Cloudflare Worker: `johnsweber-playground`
- Runtime: vinext/Next-compatible React app on Cloudflare Workers
- Node requirement: `>=22.13.0`

Cloudflare production resources:

- D1 binding `DB` -> `site-creator-d1`
- R2 binding `MEDIA` -> private bucket `site-creator-r2`
- Custom domains are attached directly to the Worker.
- `.openai/hosting.json` declares the Sites project and binding names.

Do not commit Cloudflare account IDs, resource credentials, Clerk keys, Modal
tokens, or local gateway tokens. The generated `dist/server/wrangler.json`
currently requires the real production D1 ID to be supplied after a build and
before a direct Wrangler deployment; `vite.config.ts` intentionally contains a
placeholder ID.

## Architecture at a glance

```text
Browser
  |
  | React UI + Clerk session token
  v
Cloudflare Worker (vinext routes)
  |-- Clerk verifies identity
  |-- D1 stores shared profile + experiment-owned job metadata
  |-- R2 stores private source images, thumbnails, and completed videos
  |-- Modal proxy-auth endpoints run Wan/LTX GPU generation
  `-- Protected local gateway runs ComfyUI still-image generation
```

The browser never receives Modal proxy credentials or the local gateway token.
All experiment APIs and media routes authenticate the Clerk bearer token and
scope reads/writes by Clerk user ID.

## Application surfaces

Public/general:

- `/` — portfolio and playground landing page. Its hero collage sits on a
  white gallery canvas; the portrait stays above an interactive HTML visual
  representing hands-on, playful, logical work as an abstract watercolor
  circuit field. Its orbs respond continuously to pointer or phone tilt; hover
  and touch trigger a larger color bloom.
- HTML images inherit a subtle hover lift, tilt, color-softening, and blurred
  shadow treatment. A global client-side canvas sampler reads the average color
  along each image edge and uses that four-color palette for a soft, page-scale
  burst on pointer hover or touch. The portrait and dog use opposing tilts with
  an additional faint watercolor glow.
- `/hero-preview` — unlinked, no-index phone preview for the pointer/touch and
  device-orientation-responsive Logic Playground hero concept. It is a draft
  route and is not yet used by the production homepage.
- `/portfolio` — selected, source-verified case notes spanning Humana
  responsive web leadership, GoodChat product/design principles, and the
  current applied-AI playground.
- `/resume` — public career summary and selected experience. Career facts must
  follow `docs/career-source-notes.md`; unverified metrics and case-study
  outcomes are intentionally excluded.
- Grid icon in the top-left opens the site navigation.
- The grid navigation includes a Demo/Production pill labeled `Use Production`.
  It is stored per user in browser `sessionStorage`, defaults to Demo (`false`)
  in every new browser session, and is sent to generation APIs through the
  `x-johnsweber-use-production` header.
- Navigation shows login when signed out and account details/management when
  signed in.
- `/login` — Clerk sign-in.
- `/create-account` — account creation through Google or Apple SSO only.
- `/sso-callback` — SSO completion.
- `/manage-account/*` — Clerk account management.
- `/api/gpu-status` — protected server-side Modal H100 connectivity probe.

AI Video experiment (login required):

- `/experiments/ai-video` — experiment home.
- `/experiments/ai-video/create` — Picture/Video pill selector, generation
  forms, and submitted/pending result states. Image-capable video models always
  expose the reference-image picker and local preview; Demo mode previews the
  selection but substitutes a sample result without uploading it.
- `/experiments/ai-video/library` — unified private picture/video/scene library with
  All, Picture, Video, and Scene filters. Each card has an actions menu; Delete removes
  the user-owned media row, linked video job, and associated private R2 objects.
  Scene cards derive their displayed status from their member clips, so a scene
  remains Pending while any included video is Submitted or Pending.
- `/experiments/ai-video/queue` is the authenticated processing dashboard for
  video and picture generation, final-frame extraction, and scene exports. It
  separates active work from process history and shows status, progress,
  estimates, remaining time, and owned-item links. Active entries can be
  cancelled; Modal-backed calls are cancelled remotely before their D1 media,
  job, and task records are finalized as stopped. Local picture cancellation
  stops result ingestion even if the already-running local GPU request cannot
  be interrupted. User-scoped diagnostics include safe IDs, timestamps,
  provider contact/retry state, and private-file arrival without exposing
  credentials or object keys.
- `/experiments/ai-video/media/:id` — private picture or video viewer with a
  pending state. Pending videos show their saved reference/thumbnail as a
  full preview with live generation percentage and estimated time, then
  transition automatically into the completed player. Completed videos with a
  saved last frame offer **Extend video**.
  Completed pictures offer **Animate picture**, which opens Wan with that
  user-owned picture preloaded and previewed as its reference image.
  Video players read the file's actual metadata duration and persist it back to
  the owned media record, correcting older configuration-derived durations.
  **Scan timeline** lazily samples roughly one frame per three seconds in the
  browser only when opened (minimum 4, maximum 12; a 30-second clip gets 10).
  Mouse, touch/drag, and keyboard movement show a floating preview and seek the
  private video without creating permanent thumbnail objects.
- `/experiments/ai-video/scene/:id` — sequential private scene player. Clips
  play in creation order. The player downloads every completed private clip
  before playback and keeps each video element preloaded for seamless
  transitions. A plus tile at the end of the timeline opens completed videos
  from the user's library; additions remain a draft until **Save scene**
  replaces the ordered D1 scene membership. Export is unavailable while the
  draft is unsaved or a member video is pending. Export queues a CPU-only
  FFmpeg merge that creates a new private video library item, then automatically
  opens its media view once the preview is ready.
- `/experiments/ai-video/video/:id` — private video player.
- Bottom navigation provides Home, Library, Create, Queue, and Settings.

AI Video APIs:

- `GET/POST /api/experiments/ai-video/jobs`
- `GET /api/experiments/ai-video/jobs/:id`
- `GET /api/experiments/ai-video/capacity?model=:modelKey`
- `GET /api/experiments/ai-video/jobs/:id/thumbnail`
- `GET /api/experiments/ai-video/jobs/:id/video`
- `POST /api/experiments/ai-video/local-source`
- `GET /api/experiments/ai-video/media`
- `GET /api/experiments/ai-video/media/:id`
- `DELETE /api/experiments/ai-video/media/:id`
- `GET /api/experiments/ai-video/media/:id/content`
- `GET /api/experiments/ai-video/media/:id/thumbnail`
- `POST /api/experiments/ai-video/media/:id/last-frame`
- `GET /api/experiments/ai-video/queue`
- `POST /api/experiments/ai-video/queue/cancel`
- `GET /api/experiments/ai-video/scenes/:id`
- `PATCH /api/experiments/ai-video/scenes/:id`
- `POST /api/experiments/ai-video/scenes/:id/export`
- `GET /api/experiments/ai-video/processing/:taskId/source/:mediaId`

## AI Video providers and flow

Video models are declared in `lib/ai-video-models.ts`.

- Wan 2.2 I2V-A14B
  - Image-to-video; source image required.
  - 480p (`832x480`) or 720p (`1280x720`).
  - Creator exposes the full endpoint ranges: 9–161 frames in `4n+1`
    increments, 1–30 fps, 1–80 inference steps, 0–20 guidance, CRF 14–28,
    and a deterministic seed.
  - Lowest-compute defaults are 480p, 9 frames, 1 fps, 1 inference step,
    guidance 0, CRF 28, and seed 0.
  - One-click presets: Test uses those minimums; Fast uses 480p, 81 frames at
    16 fps, 20 steps, guidance 3.5, and CRF 23; Max uses 720p, 161 frames at
    16 fps, 80 steps, guidance 3.5, and CRF 14.
  - Runtime URL: `WAN22_MODAL_URL`.
  - Current Modal app/function: `video-models` / `wan_api`.
  - Current base route:
    `https://johnsweber--video-models-wan-api.modal.run`.
  - API routes below that base remain `/generate`, `/result/{call_id}`, and
    `/video/{output_id}`.
  - `/generate` accepts the generation request as a JSON body; the Modal route
    explicitly validates that body before spawning the GPU call.
- LTX 2.3
  - Text-to-video or optional image-to-video with synchronized generated audio.
  - A JPG, PNG, or WebP reference may be uploaded or selected from the user's
    private picture library; omitting it keeps the text-to-video flow.
  - Creator exposes 256–1920 width and height in 32-pixel increments,
    9–241 frames in `8n+1` increments, 1–50 fps, and a deterministic seed.
  - Lowest-compute defaults are `256x256`, 9 frames, 1 fps, and seed 0.
  - One-click presets: Test uses those minimums; Fast uses `768x512`, 121
    frames at 24 fps; Max uses `1920x1088`, 241 frames at 24 fps.
  - Runtime URL: `LTX23_MODAL_URL`.
  - Current Modal app/function: `ltx-2-3` / `ltx_api`.
  - Current base route:
    `https://johnsweber--ltx-2-3-ltx-api.modal.run`.
  - Hugging Face access is granted for both the LTX-2.3 weights and its gated
    Gemma 3 text-encoder dependency.

Picture creation uses the protected local GPU/ComfyUI connection:

- SDXL Base 1.0 (`base`)
- Animagine XL 4.0 (`animagine`)
- Both currently generate `1024x576` private pictures.
- `npm run local-ai:start` starts ComfyUI, the authenticated local gateway, and
  a Cloudflare Quick Tunnel, then updates the encrypted Worker URL/token. The
  tunnel and generator remain available only while this computer and those
  background processes are running. Runtime files and the persistent gateway
  token live in ignored `.local-ai/`.

Video creation does not expose the local GPU. Wan accepts an uploaded JPG, PNG,
or WebP source image up to 12 MB; LTX accepts the same formats optionally and
otherwise creates directly from text. Browser
uploads larger than 1.5 MB are resized and JPEG-compressed before submission
to stay below the request gateway limit while the original remains local.

Job lifecycle:

1. Every authenticated Picture or Video submission creates an
   `ai_video_media` row with `submitted` status.
2. Accepted processing transitions the media row to `pending`; the UI shows a
   clock badge in the library and loading/view screens.
3. Video submission also creates a provider-specific `ai_video_jobs` row.
4. Source media is saved beneath the user's private R2 prefix.
5. The Worker submits `/generate` to the selected GPU provider.
6. A Cloudflare scheduled handler polls pending provider work every minute
   under a D1 lease that prevents overlapping runs. WAN results may
   identify the completed asset with either `download_path` or `output_id`; an
   `output_id` is resolved through the provider's `/video/:output_id` route.
   Browser polling remains as an idempotent acceleration/fallback, but is not
   required for result ingestion, so closing the browser cannot strand
   completed work once the scheduled trigger is attached.
7. The Worker saves the completed picture or downloads the completed MP4 to R2.
8. Generated videos queue a CPU-only Modal/FFmpeg task to decode and privately
   save the actual final frame. The media remains Pending near completion while
   this finishes. There is no browser/canvas fallback. Opening a video whose
   prior extraction failed automatically uses the authenticated
   `POST /api/experiments/ai-video/media/:id/last-frame` route to requeue that
   same server-side task; Extend remains unavailable until it succeeds.
9. Extend preloads that saved frame into Wan and attaches the original and new
   clip to a user-owned scene in creation order.
10. Scene Export always supplies authenticated private clip URLs to the CPU
    service, regardless of the Demo/Production generation toggle;
    the merged MP4 and its last frame return to R2 as a new video media item.
    FFprobe records the exported file's measured duration rather than the sum
    of requested clip durations.
11. Private thumbnail/content routes stream only after verifying ownership.

Generation environment:

- Demo is the safe default. Picture and video submissions still create
  user-scoped `ai_video_media` records (and `ai_video_jobs` for videos), pass
  through Submitted/Pending, and complete with one of twelve freely licensed
  Wikimedia Commons examples. No Modal or local GPU endpoint is called.
- Production must be explicitly enabled for the current user/browser session.
  Production video requests use the configured Wan/LTX Modal endpoints;
  Production pictures continue to use the configured local ComfyUI gateway.
- The Create screen keeps a settings-based generation estimate visible. In
  Production it also reports the selected provider as likely Warm or Cold from
  active/recent Modal-backed jobs and the providers' five-minute scaledown
  window. The capacity check never invokes or warms a GPU.
- Production generation forms offer an opt-in **Stop GPU when queue is
  complete** preference. The server waits until that model has no queued or
  running work. Modal currently exposes container termination through its CLI,
  not a safe authenticated web lifecycle API; invoking a GPU method to stop
  itself could cold-start a GPU. The queue-empty boundary is active, but the
  destructive stop is disabled and reported as unsupported while Modal uses
  its configured idle shutdown.
- The toggle applies to generative model calls. Deterministic operations on
  already-saved media, including scene playback and CPU/FFmpeg export, always
  operate on the user's actual files.
- Demo creation downloads the selected Commons asset once and stores a
  user-owned copy under the account's private R2 prefix. Attribution and license
  data are retained as object metadata. This gives last-frame extraction and
  scene export stable server-side inputs. The authenticated routes retain their
  validated Commons proxy only for older library rows created before this
  storage change.
  Image-guided production models do not require a source upload in Demo mode.
  Source/creator/license details are maintained in
  `docs/demo-media-sources.md` and `lib/demo-media.ts`.

## Data boundaries

Schema source: `db/schema.ts`; migrations: `drizzle/`.

Shared across experiments:

- `shared_user_profiles` — display metadata only. Clerk remains authoritative
  for identity, authentication, account security, and sessions.
- `experiment_catalog` — experiment slug, display name, status, and unique API
  namespace.

Owned only by AI Video:

- `ai_video_media` — unified user library metadata for pictures and videos,
  including `submitted`, `pending`, `complete`, or `failed` status. Existing
  video jobs are backfilled into this table by migration `0002`.
- `ai_video_jobs` — configuration, provider/model, progress, Modal call/result
  references, private object keys, error state, and timestamps for videos.
- `ai_video_scenes` — user-owned scene metadata and its library media row.
- `ai_video_scene_items` — ordered video membership for a scene.
- `ai_video_processing_tasks` — pending/progress/error state and short-lived
  source authorization for last-frame extraction and scene export.
- `ai_video_reconciler_state` — singleton lease and last-run health for the
  browser-independent scheduled reconciler.
- D1 queries always include `user_id` for user-owned records.
- R2 keys use:
  `experiments/ai-video/users/{clerkUserId}/{pictures|sources|videos}/...`

When adding another experiment:

1. Give it `/api/experiments/{slug}`.
2. Add its own tables instead of extending or reusing `ai_video_jobs`.
3. Give it `experiments/{slug}/users/{clerkUserId}/...` R2 prefixes.
4. Reuse only Clerk/account status and `shared_user_profiles`.
5. Add the experiment to `experiment_catalog`.

## Important files

- `app/layout.tsx` — root layout and auth provider wiring.
- `app/site-navigation.tsx` — grid navigation and signed-in/out experience.
- `app/auth-provider.tsx`, `app/auth-screen.tsx` — Clerk integration.
- `app/experiments/ai-video/ai-video-app.tsx` — shared experiment UI.
- `app/api/experiments/ai-video/` — authenticated job and media endpoints.
- `lib/api-auth.ts` — Clerk API authentication.
- `lib/ai-video-models.ts` — supported model/quality/duration matrix.
- `lib/demo-media.ts` — licensed Demo asset catalog and safe media proxy.
- `lib/production-mode.ts`, `lib/use-production-mode.ts` — request header and
  browser-session mode state.
- `lib/ai-video-service.ts` — job projection, progress, result ingestion.
- `lib/ai-video-processing.ts` — CPU task polling and result ingestion.
- `lib/ai-video-reconciler.ts` — leased scheduled reconciliation and the
  provider-queue shutdown boundary.
- `db/schema.ts`, `db/ai-video.ts` — schema and D1 access.
- `drizzle/` — production SQL migrations.
- `worker/index.ts` — Cloudflare Worker entry.
- `vite.config.ts` — vinext, Sites, and Cloudflare bindings.
- `modal_app.py` — lightweight playground H100 health/probe service; the Wan
  and LTX generation deployments are separate Modal apps.
- `modal_media_tools.py` — CPU-only FFmpeg service for last-frame extraction
  and scene merge/export.

## Runtime configuration

Browser/build:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Encrypted Worker runtime values:

- `CLERK_SECRET_KEY`
- `MODAL_GPU_URL`
- `MODAL_PROXY_TOKEN_ID`
- `MODAL_PROXY_TOKEN_SECRET`
- `WAN22_MODAL_URL`
- `LTX23_MODAL_URL`
- `LOCAL_IMAGE_GATEWAY_URL`
- `LOCAL_IMAGE_GATEWAY_TOKEN`
- `MEDIA_TOOLS_MODAL_URL`

Use ignored local `.env*` files for development and Cloudflare Worker secrets
for production. Never display or document their values.

## Development, validation, and deployment

```bash
npm install
npm run dev
npm run lint
npm test
npm run local-ai:start
```

`npm test` performs a production build and rendered-HTML tests. Relevant
checks should be run in proportion to the change. Do not start visual/browser
testing without the user's permission.

Standard deployment target:

```bash
npm run deploy
```

When the user says **deploy**, first determine whether source changed after the
existing validated `dist/` build. Recompile when needed; otherwise reuse
`dist/`. Do not require the user to separately say **compile**.

When source changed, compile and deploy with:

```bash
npm run deploy:recompile
```

That command builds, resolves the production D1 database ID by name, prepares
the generated Worker configuration, and then deploys it. The Clerk publishable
key must be present during that build. Wrangler must be authenticated to the
correct Cloudflare account. Apply new SQL files to remote D1 before deploying
code that depends on them. A non-visual HTTP status check is acceptable after
deployment; ask before browser or visual testing.

## Known operational constraints

- Modal GPU endpoints are usage-metered and cold starts can dominate latency.
- Cloudflare Cron Triggers require the account-level `workers.dev` subdomain to
  be initialized even when the Worker is served only through custom domains.
  Until that one-time account prerequisite exists, Worker source can deploy but
  the scheduled reconciler trigger cannot be attached.
- The local ComfyUI source option works only while the private local gateway is
  online and reachable at its configured URL.
- Generated media is private in R2; there are no public bucket URLs.
- Job, last-frame, and export result ingestion is handled by a one-minute
  Cloudflare scheduled reconciler and no longer depends on an open browser.
- Result fetches have bounded timeouts. A temporary provider/result-fetch
  failure leaves work pending for up to 12 attempts and records provider
  contact/retry diagnostics. Confirmed provider failures atomically advance
  the associated job, media, or processing task to the appropriate terminal
  state.
- Cloudflare R2/D1/Workers and Modal have separate usage limits/billing.
