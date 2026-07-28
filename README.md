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
