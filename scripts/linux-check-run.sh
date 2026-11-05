#!/usr/bin/env bash
# Runs inside the container built by linux-check.Dockerfile.
set -euo pipefail

npm run typecheck
npm test
npm run build
# Chromium's sandbox stays on: linux-check.sh gives the container user
# namespaces (seccomp=unconfined), as a desktop has.
xvfb-run -a npx electron . --self-test
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-smoke.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-smoke.ts --dev
# Onboarding with a fake claude; Claude Code isn't installed in the image, so
# the first phase checks the "not installed" state for real.
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-onboarding.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-onboarding.ts --dev
# Quitting and closing the window (on Linux closing quits, asking first).
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-quit.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-quit.ts --dev
# Continuing interrupted work after a restart (spec §9.7).
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-continue.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-continue.ts --dev
# Clicking a notification (spec §10.3).
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-notifications.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-notifications.ts --dev
# New versions, against a fake release endpoint (spec §15.7).
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-updates.ts
xvfb-run -a npx tsx --tsconfig tsconfig.node.json scripts/e2e-updates.ts --dev
