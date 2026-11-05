#!/usr/bin/env bash
# Runs inside the container built by linux-check.Dockerfile.
set -euo pipefail

npm run typecheck
npm test
npm run build
# Chromium's sandbox stays on: linux-check.sh gives the container user
# namespaces (seccomp=unconfined), as a desktop has.
xvfb-run -a npx electron . --self-test
# Every e2e suite in scripts/e2e-suites.json, on the production build and the
# dev server, each under its own xvfb-run.
npx tsx --tsconfig tsconfig.node.json scripts/e2e.ts --xvfb
