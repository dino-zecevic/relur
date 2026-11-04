# Contributing to Relur

Thanks for your interest. Issues and pull requests are welcome: bug reports, fixes, documentation, and features that fit the [specification](../docs/SPEC.md).

## Setup

You need macOS or Linux, Node.js 22 and git. On Linux also a C++ compiler, make and Python 3 (`sudo apt install build-essential python3`), which node-pty needs.

```sh
git clone https://github.com/relur-dev/relur.git
cd relur
npm ci
npm run dev
```

`npm run dev` runs the app with the Vite dev server. `npm run install-app` builds the app for this machine and installs it as the install script does.

A new git worktree of this repository has no `node_modules`: run `npm ci` there first.

[CLAUDE.md](../CLAUDE.md) describes where things live in the code and the conventions to follow.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | The app with the Vite dev server |
| `npm run check` | Lint (Biome), typecheck, unit tests (Vitest), the product-name check and the notices check |
| `npm run e2e` | End-to-end tests against the production build and the dev server, with a fake `claude` (several minutes) |
| `npm run verify` | `check`, then `e2e` |
| `npm run install-app` | Build and install the app on this machine |
| `npm run package -- --arch all` | On a Mac: zips and dmgs for arm64 and x64, with `SHA256SUMS`, in `dist/` |
| `npm run gen:notices` | Regenerate `THIRD_PARTY_NOTICES` after a dependency change |
| `scripts/linux-check.sh` | Typecheck, tests, build and the e2e tests on Linux, in Docker (`PLATFORM=linux/amd64` for x64) |
| `scripts/linux-package.sh` | The Linux AppImage and `.deb` for this machine's architecture, built in Docker |

Pushing a version tag runs `.github/workflows/release.yml`, which builds and publishes a GitHub Release. Packaging details are in the spec, §15.4 and §15.6.

## Rules for a change

- **`npm run verify` passes** before you open a pull request. The e2e tests use a fake `claude`, never the real one.
- **The spec is the source of truth.** A change in behaviour updates [docs/SPEC.md](../docs/SPEC.md) in the same pull request, with e2e coverage of the new behaviour.
- **The Guide follows the spec.** The in-app Guide's pages (`src/renderer/src/guide/pages/`, ordered in `guide/content.ts`) are updated with every behaviour change they describe.
- **No company-specific content.** No company names, internal hosts, accounts or other organisation-specific values in code, tests, docs or examples. Use generic ones (`ABC-142`, `you@example.com`).
- **The product name lives in `src/shared/brand.ts` only.** `npm run check:name` fails if it appears elsewhere in code.
- **Dependencies:** exact versions only, at least 14 days old. Run `npm run gen:notices` after adding or updating one.
- **Match the surrounding code:** its comment density, naming and idioms. Comments cite spec sections (`spec §6.1`) where behaviour comes from the spec.
- **Live checks against the real Claude Code**, if you make any: a cheap model (`--model haiku`), scratch folders and a Claude account you can spare, never real work repositories.

## Proposing a change

1. **Open an issue first** for anything beyond a small fix, so we can agree on the behaviour before you write code. For a feature, use the feature request template and describe the problem it solves.
2. **Fork the repository** and create a branch.
3. **Make the change**, with the spec, the Guide and tests updated as above.
4. **Run `npm run verify`.**
5. **Open a pull request** and fill in its template: what changed, why, and how you tested it.

Security issues don't go in public issues: see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT license](../LICENSE), and to follow the [code of conduct](CODE_OF_CONDUCT.md).
