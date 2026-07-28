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
