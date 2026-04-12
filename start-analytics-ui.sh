#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @ntcoding/workflow-control-center build:ui
pnpm --filter @ntcoding/workflow-control-center start --open
