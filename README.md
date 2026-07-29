# John Weber — AI Playground

The source for the public portfolio and experiment playground at
[johnsweber.com](https://johnsweber.com).

It runs as a vinext application on Cloudflare Workers. The GPU probe is routed
server-side to a protected Modal H100 endpoint, so visitors do not need a Modal
account and Modal credentials are never shipped to the browser.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

## Validation and deployment

```bash
npm test
npm run deploy
```

The deploy command publishes the built Worker to both `johnsweber.com` and
`www.johnsweber.com`. Wrangler must already be authenticated to the correct
Cloudflare account.

The Worker expects these encrypted runtime secrets:

- `MODAL_GPU_URL`
- `MODAL_PROXY_TOKEN_ID`
- `MODAL_PROXY_TOKEN_SECRET`

The Modal service itself is defined in `modal_app.py`.

## Authentication

The navigation and account screens use Clerk with Google and Apple SSO. Copy
`.env.example` to `.env.local` and replace the placeholders with credentials
from the Clerk application:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
CLERK_SECRET_KEY=sk_test_replace_me
```

Keep real credentials in local environment files or encrypted Cloudflare
Worker secrets. Never commit them to the repository.

## AI Video experiment

`/experiments/ai-video` is an authenticated, private generation workspace.
Clerk supplies identity, D1 stores user-owned job metadata, and the `MEDIA` R2
binding stores source images and completed MP4 files. Every API and media route
verifies the Clerk bearer token and scopes records to the token subject.

Experiment data is intentionally isolated:

- `shared_user_profiles` contains reusable account display metadata.
- `experiment_catalog` reserves a unique API namespace for each experiment.
- `ai_video_jobs` belongs only to the AI Video experiment.
- R2 object keys are namespaced by experiment and Clerk user ID.

The deployed Modal model services require:

- `WAN22_MODAL_URL`
- `LTX23_MODAL_URL`
- `MODAL_PROXY_TOKEN_ID`
- `MODAL_PROXY_TOKEN_SECRET`

Wan 2.2 supports image-to-video at 480p or 720p for approximately 5 or
10 seconds. LTX 2.3 supports text-to-video with synchronized audio at
768×512 or 1280×768 for approximately 5 or 10 seconds.

For Wan source images, the Create screen can either accept an upload or call
the protected local ComfyUI gateway. The local option offers SDXL Base 1.0 and
Animagine XL 4.0, returns the generated still privately to the browser, and
then hands that still to Wan for animation. It requires:

- `LOCAL_IMAGE_GATEWAY_URL`
- `LOCAL_IMAGE_GATEWAY_TOKEN`
