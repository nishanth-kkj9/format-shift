# Contributing to FormatShift

Thanks for considering a contribution. A few ground rules keep the project
small and maintainable.

## Setup

```sh
npm install
npm run dev:all   # Vite on :5173 proxying /api to the server on :4000
```

## Checks

Run all of these before opening a PR — CI runs the same ones:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test -- --coverage   # coverage thresholds are enforced (80% on core modules)
npm run build
```

## Scope

- This is deliberately a small dependency set. Before adding a package, ask
  whether the standard library or a few lines of code covers it.
- The spectrum visualizer engine (`src/utils/visualizer/`) is hand-tuned.
  Keep changes surgical and justify them in the PR description.
- Server-side ffmpeg work goes through the semaphore in
  `server/ffmpeg/runner.ts`; never spawn ffmpeg directly in a route.

## Security

Report security issues privately (see the Security section of the README)
rather than opening a public issue. Do not include secrets in issues or PRs.

## Commits

Use clear, conventional commit messages (e.g. `feat:`, `fix:`, `chore:`).
Keep the diff focused on the stated change.
