# Johnsweber.com project context

Last updated: 2026-07-28

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
  representing hands-on, playful, logical work. The visual responds to
  pointer/touch input and optionally to device orientation.
- `/hero-preview` — unlinked, no-index phone preview for the pointer/touch and
  device-orientation-responsive Logic Playground hero concept. It is a draft
  route and is not yet used by the production homepage.
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
  forms, and submitted/pending result states.
- `/experiments/ai-video/library` — unified private picture/video library with
  All, Picture, and Video filters. Each card has an actions menu; Delete removes
  the user-owned media row, linked video job, and associated private R2 objects.
- `/experiments/ai-video/media/:id` — private picture or video viewer with a
  pending state.
- `/experiments/ai-video/video/:id` — private video player.
- Bottom navigation provides Home, Create, Library, and placeholders.

AI Video APIs:

- `GET/POST /api/experiments/ai-video/jobs`
- `GET /api/experiments/ai-video/jobs/:id`
- `GET /api/experiments/ai-video/jobs/:id/thumbnail`
- `GET /api/experiments/ai-video/jobs/:id/video`
- `POST /api/experiments/ai-video/local-source`
- `GET /api/experiments/ai-video/media`
- `GET /api/experiments/ai-video/media/:id`
- `DELETE /api/experiments/ai-video/media/:id`
- `GET /api/experiments/ai-video/media/:id/content`
- `GET /api/experiments/ai-video/media/:id/thumbnail`

## AI Video providers and flow

Video models are declared in `lib/ai-video-models.ts`.

- Wan 2.2 I2V-A14B
  - Image-to-video; source image required.
  - 480p (`832x480`) or 720p (`1280x720`).
  - Approximately 5 or 10 seconds at 16 fps.
  - Runtime URL: `WAN22_MODAL_URL`.
  - Current Modal app/function: `video-models` / `wan_api`.
  - Current base route:
    `https://johnsweber--video-models-wan-api.modal.run`.
  - API routes below that base remain `/generate`, `/result/{call_id}`, and
    `/video/{output_id}`.
- LTX 2.3
  - Text-to-video with synchronized generated audio.
  - `768x512` or `1280x768`.
  - Approximately 5 or 10 seconds at 24 fps.
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
or WebP source image up to 12 MB; LTX creates directly from text.

Job lifecycle:

1. Every authenticated Picture or Video submission creates an
   `ai_video_media` row with `submitted` status.
2. Accepted processing transitions the media row to `pending`; the UI shows a
   clock badge in the library and loading/view screens.
3. Video submission also creates a provider-specific `ai_video_jobs` row.
4. Source media is saved beneath the user's private R2 prefix.
5. The Worker submits `/generate` to the selected GPU provider.
6. The UI polls the media/job route while work is pending.
7. The Worker saves the completed picture or downloads the completed MP4,
   saves it
   to R2, and marks the D1 job complete.
8. Private thumbnail/content routes stream only after verifying ownership.

Generation environment:

- Demo is the safe default. Picture and video submissions still create
  user-scoped `ai_video_media` records (and `ai_video_jobs` for videos), pass
  through Submitted/Pending, and complete with one of twelve freely licensed
  Wikimedia Commons examples. No Modal or local GPU endpoint is called.
- Production must be explicitly enabled for the current user/browser session.
  Production video requests use the configured Wan/LTX Modal endpoints;
  Production pictures continue to use the configured local ComfyUI gateway.
- Demo media stays behind the authenticated private media routes. Those routes
  proxy only validated `commons.wikimedia.org` URLs recorded by the server and
  identify the application with Wikimedia-compliant request headers.
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
- `db/schema.ts`, `db/ai-video.ts` — schema and D1 access.
- `drizzle/` — production SQL migrations.
- `worker/index.ts` — Cloudflare Worker entry.
- `vite.config.ts` — vinext, Sites, and Cloudflare bindings.
- `modal_app.py` — lightweight playground H100 health/probe service; the Wan
  and LTX generation deployments are separate Modal apps.

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
- Result fetches have bounded timeouts; a temporary provider failure normally
  leaves a job running so a later poll can retry.
- Cloudflare R2/D1/Workers and Modal have separate usage limits/billing.
