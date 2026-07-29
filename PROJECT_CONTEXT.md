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
  play in creation order and Export queues a CPU-only FFmpeg merge that creates
  a new private video library item. The scene polls the export and automatically
  opens the merged video's media view once its preview is ready.
- `/experiments/ai-video/video/:id` — private video player.
- Bottom navigation provides Home, Create, Library, and placeholders.

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
- `GET /api/experiments/ai-video/scenes/:id`
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
  - Text-to-video with synchronized generated audio.
  - Creator exposes 256–1920 width and height in 32-pixel increments,
    9–241 frames in `8n+1` increments, 1–50 fps, and a deterministic seed.
  - Lowest-compute defaults are `256x256`, 9 frames, 1 fps, and seed 0.
  - One-click presets: Test uses those minimums; Fast uses `768x512`, 121
    frames at 24 fps; Max uses `1920x1088`, 241 frames at 24 fps.
  - Runtime URL: `LTX23_MODAL_URL`.

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
or WebP source image up to 12 MB; LTX creates directly from text. Browser
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
6. The UI polls the media/job route while work is pending.
7. The Worker saves the completed picture or downloads the completed MP4 to R2.
8. Future generated videos queue a CPU-only Modal/FFmpeg task to extract and
   privately save the final frame. The media remains Pending near completion
   while this finishes. If that CPU task does not produce a frame, opening the
   completed video triggers an authenticated browser fallback: a separate
   video element seeks to the final frame, canvas encodes it as JPEG, and
   `POST /api/experiments/ai-video/media/:id/last-frame` saves it to private R2.
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
- The local ComfyUI source option works only while the private local gateway is
  online and reachable at its configured URL.
- Generated media is private in R2; there are no public bucket URLs.
- Job result ingestion is request/poll driven, not a background queue.
- Last-frame and export ingestion are also request/poll driven; pending work can
  be left and safely resumed from the library or scene.
- Result fetches have bounded timeouts; a temporary provider failure normally
  leaves a job running so a later poll can retry.
- Cloudflare R2/D1/Workers and Modal have separate usage limits/billing.
