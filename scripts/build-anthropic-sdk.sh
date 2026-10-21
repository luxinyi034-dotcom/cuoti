#!/usr/bin/env bash
# 把 Anthropic 官方 JS SDK 打包成浏览器能直接用的 site/vendor/anthropic-sdk.mjs（AI 识别里的 Claude 用它）。
# 换版本时改 VERSION，重新运行，然后照常升 App 版本号发布。
set -euo pipefail
VERSION=0.131.0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=$(mktemp -d)
cd "$DIR"
npm init -y >/dev/null
npm i "@anthropic-ai/sdk@$VERSION" esbuild@0.25.0 >/dev/null
cat > entry.mjs <<'JS'
export { default, APIError, APIConnectionError, APIUserAbortError, AuthenticationError, PermissionDeniedError, RateLimitError, BadRequestError, NotFoundError, InternalServerError } from '@anthropic-ai/sdk';
JS
OUT="$ROOT/site/vendor"
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2019 --minify --legal-comments=eof --outfile="$OUT/anthropic-sdk.mjs"
cp node_modules/@anthropic-ai/sdk/LICENSE "$OUT/anthropic-sdk.LICENSE"
echo "✓ @anthropic-ai/sdk@$VERSION → $OUT/anthropic-sdk.mjs"
