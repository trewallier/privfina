#!/usr/bin/env bash
# Stage data/market/v1, commit when the index changes, push to origin, then clear auth extraheader.
set -euo pipefail

: "${MARKET_DATA_PATH:?MARKET_DATA_PATH is required}"
BRANCH="${MARKET_DATA_BRANCH:-market-data}"
ADD_PATH="${MARKET_ADD_PATH:-data/market/v1}"
NO_PUSH="${MARKET_NO_PUSH:-false}"
EXTRAHEADER_KEY="http.https://github.com/.extraheader"

clear_auth() {
  git -C "${MARKET_DATA_PATH}" config --unset-all "${EXTRAHEADER_KEY}" 2>/dev/null || true
}
trap clear_auth EXIT

git -C "${MARKET_DATA_PATH}" add -- "${ADD_PATH}"

if git -C "${MARKET_DATA_PATH}" diff --staged --quiet; then
  echo '{"committed":false,"pushed":false,"message":null}'
  exit 0
fi

ASOF="unknown"
MANIFEST="${MARKET_DATA_PATH}/${ADD_PATH}/manifest.json"
if [[ -f "${MANIFEST}" ]]; then
  ASOF="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.asOf||'unknown')" "${MANIFEST}")"
fi
MSG="market-data: asOf ${ASOF}"
git -C "${MARKET_DATA_PATH}" commit -m "${MSG}"

if [[ "${NO_PUSH}" == "true" ]]; then
  echo "{\"committed\":true,\"pushed\":false,\"message\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${MSG}")}"
  exit 0
fi

git -C "${MARKET_DATA_PATH}" push -u origin "HEAD:${BRANCH}"
echo "{\"committed\":true,\"pushed\":true,\"message\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${MSG}")}"
