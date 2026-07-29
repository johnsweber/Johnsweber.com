# Technical debt register

Last reviewed: 2026-07-29

This is the working register for deliberate shortcuts, aging foundations, and
known architectural pressure in Johnsweber.com. Read it with
`PROJECT_CONTEXT.md` before planning structural work.

Priorities: **P0** threatens security, privacy, data integrity, or recovery;
**P1** materially slows feature work or makes processing unreliable; **P2** is
a maintainability or operational improvement that can wait; **Watch** is
acceptable today but has a reassessment trigger.

## Current priorities

### TD-001 — AI Video UI is a large shared component

- **Priority:** P1
- **Compromise:** Most experiment screens and interaction state live in
  `app/experiments/ai-video/ai-video-app.tsx`.
- **Consequence:** Creation, queue, library, media, and scene changes have a
  wide regression surface and are difficult to test independently.
- **Next step:** Extract route-level feature components and hooks without
  changing URLs or behavior. Start with creation, scene player, media viewer,
  and queue.
- **Retired when:** Each major route can be changed and tested without
  importing the complete experiment application or unrelated route state.

### TD-002 — Provider behavior is coupled to orchestration

- **Priority:** P1
- **Compromise:** Wan, LTX, NAVA, Z-Image, local ComfyUI, and CPU media tools
  expose different payloads, statuses, result IDs, errors, and lifecycles.
  Normalization is spread across API, service, and reconciliation paths.
- **Consequence:** Adding or upgrading a model can independently break
  submission, polling, estimates, cancellation, or ingestion.
- **Next step:** Introduce a typed provider adapter contract for capabilities,
  submission, normalized results, cancellation, retry classification, and safe
  diagnostics. Migrate one provider at a time.
- **Retired when:** Core orchestration does not branch on provider names and
  contract tests cover every adapter without GPU calls.

### TD-003 — Processing state is not one explicit state machine

- **Priority:** P1
- **Compromise:** Media, job, task, last-frame, export, and scene records
  independently represent lifecycle state.
- **Consequence:** Late completion, cancellation, missing scene dependencies,
  or partial R2 ingestion can produce contradictory states and UI edge cases.
- **Next step:** Document allowed transitions and invariants, centralize
  guarded transition helpers, and test cancellation versus late completion,
  idempotent R2 arrival, last-frame failure, and scene aggregation.
- **Retired when:** All state changes use guarded helpers, invalid transitions
  fail visibly, and reconciliation can safely replay every terminal transition.

### TD-004 — Scheduled reconciliation has an activation prerequisite

- **Priority:** P0 until production cron is confirmed; P2 afterward
- **Compromise:** Browser-independent ingestion exists, but Cloudflare Cron
  Triggers cannot attach until the account-level `workers.dev` subdomain is
  initialized.
- **Consequence:** If the trigger is absent, closing the browser can still
  strand provider results despite the reconciler implementation.
- **Next step:** Confirm an active one-minute production trigger and expose its
  last successful run in Queue diagnostics. Do not infer health from a
  successful Worker deployment.
- **Retired when:** Production shows repeated scheduled runs and an owner-visible
  stale indicator when runs stop.

### TD-005 — Queue-empty GPU shutdown is intentionally incomplete

- **Priority:** P2
- **Compromise:** The preference and server-side queue-empty boundary persist,
  but destructive shutdown is disabled. Modal exposes CLI termination rather
  than a suitable authenticated runtime API; invoking a GPU method could itself
  cold-start a GPU.
- **Consequence:** The service relies on Modal's configured idle scale-down
  after the queue empties.
- **Next step:** Reassess when Modal offers a supported lifecycle API, or add a
  tightly scoped control service that cannot start inference or stop another
  user's active call.
- **Retired when:** Official authenticated shutdown has concurrency tests; or
  the UI is permanently reframed as idle scale-down rather than immediate stop.

### TD-006 — Local picture generation depends on the owner's workstation

- **Priority:** P2
- **Compromise:** SDXL and Animagine production requests require the PC,
  ComfyUI, a local gateway, and a Cloudflare Quick Tunnel.
- **Consequence:** Models are unavailable when the machine or processes are
  offline, and local cancellation cannot stop underlying synchronous work.
- **Next step:** Keep availability explicit. If these models become a product
  requirement, move them behind a durable hosted provider adapter.
- **Retired when:** They have durable asynchronous execution and cancellation,
  or are deliberately labeled owner-machine experiments.

### TD-007 — Direct deployment requires generated configuration preparation

- **Priority:** P1
- **Compromise:** `vite.config.ts` has a placeholder D1 ID and generated Worker
  configuration is prepared with the production binding after a build.
- **Consequence:** Deployment depends on custom scripts and is easier to misuse
  outside the established path.
- **Next step:** Keep deployment behind checked-in scripts and add a non-secret
  preflight that rejects a placeholder binding. Prefer Sites-owned logical
  binding when it supports the current output.
- **Retired when:** A clean checkout deploys using logical bindings without
  editing generated files or knowing resource IDs.

### TD-008 — Legacy demo-media compatibility remains

- **Priority:** P2
- **Compromise:** New demo assets are copied to private R2, but older rows may
  use the authenticated Commons proxy. Older scenes may still need bounded
  thumbnail-copy backfill.
- **Consequence:** Media access has compatibility branches and some old rows
  can depend on external source availability.
- **Next step:** Count and idempotently migrate remaining legacy rows while
  retaining attribution metadata.
- **Retired when:** No live row relies on a remote demo URL or another media
  item's thumbnail key, and compatibility branches are removed.

### TD-009 — Timing and warm/cold estimates are heuristic

- **Priority:** P2
- **Compromise:** Anonymous timing data improves estimates, but cold starts are
  inferred from recent activity rather than provider telemetry.
- **Consequence:** Estimates may be wrong after provider deploys or scaling
  changes.
- **Next step:** Capture queue, startup, load, inference, transfer, and
  post-processing timestamps where available; show confidence and sample size.
- **Retired when:** Estimates use sufficient per-model/settings observations
  and distinguish measured from inferred lifecycle phases.

### TD-010 — NAVA is an experimental heavyweight integration

- **Priority:** Watch
- **Compromise:** NAVA depends on gated weights, a relative upstream checkpoint
  layout, pinned CUDA/PyTorch/FlashAttention, and an expensive first validation.
- **Consequence:** Upstream changes can break deployment or inference, while
  validation without paid inference cannot prove end-to-end output.
- **Next step:** Keep startup preflights and actionable logs, pin upstream
  revisions, and record the first intentionally authorized production smoke
  test.
- **Retired when:** A reproducible pinned deployment plus a small authorized
  smoke test reliably validates dependency updates.

### TD-011 — Timeline previews are ephemeral browser work

- **Priority:** Watch
- **Compromise:** Video timeline thumbnails are sampled lazily in the browser
  and are not persisted.
- **Consequence:** This saves storage and server work, but long or constrained
  sessions may resample and use extra memory.
- **Next step:** Measure first. If slow, generate a compact private contact
  sheet only when editing is requested.
- **Retired when:** Keep the current design if measured performance is
  acceptable; otherwise ship cached, private, invalidation-aware previews.

## Foundation refresh strategy

Do not restart from a prompt solely because the codebase is aging. Preserve the
working product, production data, authentication, and storage ownership while
replacing internals behind stable boundaries.

During rapid development, use an approximate **70% product iteration / 30%
foundation refresh** allocation:

1. Extract provider adapters.
2. Centralize processing state transitions.
3. Split AI Video by route and feature.
4. Make reconciliation and deployment health observable.
5. Retire compatibility paths after bounded migrations.

Reconsider a full rebuild only if at least two become true:

- Core identity or experiment-isolation boundaries are wrong.
- The runtime cannot support required durable processing.
- D1/R2 ownership requires destructive redesign rather than additive migration.
- Most features still require coordinated UI, API, provider, and reconciler
  edits after adapters and transition helpers exist.
- A replacement can use copied production-like data and pass existing
  behavioral tests before cutover.

Until then, use a strangler refresh: add the cleaner boundary, migrate one
working path, verify it, then delete the superseded path.

## Maintenance

- Add debt when accepting a meaningful shortcut; do not hide it in a generic
  TODO.
- Update priority when incidents change the risk.
- Review this file before broad refactors and after provider, schema, storage,
  authentication, or deployment changes.
- Debt is not a feature backlog; user-facing ideas belong elsewhere.
