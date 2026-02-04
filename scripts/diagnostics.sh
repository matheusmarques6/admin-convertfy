#!/usr/bin/env bash
set -euo pipefail

printf "Node version: %s\n" "$(node -v)"
printf "NPM version: %s\n" "$(npm -v)"

echo "Running lint..."
npm run lint

echo "Running build..."
npm run build
