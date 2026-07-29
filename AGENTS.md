# Agent entry point

Before scanning the repository or starting implementation:

1. Read `PROJECT_CONTEXT.md` completely.
2. Run `git status --short` to identify user-owned work in progress.
3. Inspect only the files relevant to the current task.

Treat `PROJECT_CONTEXT.md` as the fast orientation guide, not as a replacement
for source code when exact behavior matters. Update it in the same change
whenever architecture, routes, capabilities, infrastructure, data ownership,
external services, environment variables, validation, or deployment procedures
change materially.

Project conventions:

- GitHub `main` is the source of truth for the latest production version.
- Do not perform browser or visual testing without asking the user first.
- Never commit credentials or copy secret values into documentation or output.
- Preserve experiment isolation: shared identity/account metadata may be reused,
  but each experiment owns its API namespace, tables, and object-storage prefix.
- Keep external/network operations short and report promptly if one times out.
- Default deployment is `npm run deploy`, which reuses the existing validated
  `dist/` build for fast iteration. Do not recompile unless the user explicitly
  asks. When requested, use `npm run deploy:recompile` with the required
  build-time environment configured.
