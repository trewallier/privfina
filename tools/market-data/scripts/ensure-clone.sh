#!/usr/bin/env bash
# Ensure MARKET_DATA_PATH is a git worktree ready for authenticated push.
# If MARKET_BRANCH_EXISTS=true, checkout must already have populated the path.
# If false, create an orphan branch and configure HTTPS extraheader from GITHUB_TOKEN.
set -euo pipefail

: "${MARKET_DATA_PATH:?MARKET_DATA_PATH is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${MARKET_BRANCH_EXISTS:?MARKET_BRANCH_EXISTS is required (true|false)}"
BRANCH="${MARKET_DATA_BRANCH:-market-data}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

mkdir -p "${MARKET_DATA_PATH}"

if [[ "${MARKET_BRANCH_EXISTS}" == "true" ]]; then
  if [[ ! -d "${MARKET_DATA_PATH}/.git" ]]; then
    echo "expected existing clone at ${MARKET_DATA_PATH} but .git is missing" >&2
    exit 1
  fi
elif [[ "${MARKET_BRANCH_EXISTS}" == "false" ]]; then
  if [[ -d "${MARKET_DATA_PATH}/.git" ]]; then
    echo "refusing to re-init existing git dir at ${MARKET_DATA_PATH}" >&2
    exit 1
  fi
  if [[ -z "${TOKEN}" ]]; then
    echo "GITHUB_TOKEN required to init orphan market-data clone" >&2
    exit 1
  fi
  git -C "${MARKET_DATA_PATH}" init
  git -C "${MARKET_DATA_PATH}" checkout --orphan "${BRANCH}"
  git -C "${MARKET_DATA_PATH}" remote add origin "https://github.com/${GITHUB_REPOSITORY}.git"
  basic="$(printf 'x-access-token:%s' "${TOKEN}" | base64 | tr -d '\n')"
  git -C "${MARKET_DATA_PATH}" config http.https://github.com/.extraheader "AUTHORIZATION: basic ${basic}"
else
  echo "MARKET_BRANCH_EXISTS must be true or false (got ${MARKET_BRANCH_EXISTS})" >&2
  exit 1
fi

git -C "${MARKET_DATA_PATH}" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "${MARKET_DATA_PATH}" config user.name "github-actions[bot]"
echo "{\"path\":\"${MARKET_DATA_PATH}\",\"branch\":\"${BRANCH}\",\"exists\":\"${MARKET_BRANCH_EXISTS}\"}"
