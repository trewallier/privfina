#!/usr/bin/env bash
# Download (if needed), SHA256-verify, and install pinned Poppler debs from poppler.manifest.
# On hash mismatch of a cached file: delete, re-download once, re-verify; only then fail closed.
# Set POPPLER_SKIP_INSTALL=1 to stop after verify (CI unit tests; no sudo/dpkg).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST="${POPPLER_MANIFEST:-${ROOT}/poppler.manifest}"
DEB_DIR="${POPPLER_DEB_DIR:-${ROOT}/.poppler-debs}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "poppler manifest missing: ${MANIFEST}" >&2
  exit 1
fi

mkdir -p "${DEB_DIR}"

declare -a PACKAGES=()
declare -a VERSIONS=()
declare -a FILES=()
declare -a HASHES=()
declare -a URLS=()

while IFS=$'\t' read -r pkg ver file hash url || [[ -n "${pkg:-}" ]]; do
  [[ -z "${pkg}" || "${pkg}" == \#* ]] && continue
  if [[ "${url}" == https://* ]]; then
    :
  elif [[ "${POPPLER_ALLOW_FILE_URLS:-}" == "1" && "${url}" == file://* ]]; then
    : # test-only local fixtures
  else
    echo "refusing non-HTTPS poppler URL for ${pkg}: ${url}" >&2
    exit 1
  fi
  if [[ ! "${hash}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "invalid sha256 for ${pkg}: ${hash}" >&2
    exit 1
  fi
  PACKAGES+=("${pkg}")
  VERSIONS+=("${ver}")
  FILES+=("${file}")
  HASHES+=("${hash}")
  URLS+=("${url}")
done < "${MANIFEST}"

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  echo "poppler manifest has no packages: ${MANIFEST}" >&2
  exit 1
fi

download_deb() {
  local dest="$1"
  local url="$2"
  local label="$3"
  echo "Downloading ${label}"
  curl -fsSL --retry 3 --retry-delay 2 -o "${dest}.partial" "${url}"
  mv "${dest}.partial" "${dest}"
}

verify_deb() {
  local dest="$1"
  local expected="$2"
  local actual
  actual="$(sha256sum "${dest}" | awk '{print $1}')"
  [[ "${actual}" == "${expected}" ]]
}

for i in "${!FILES[@]}"; do
  dest="${DEB_DIR}/${FILES[$i]}"
  expected="${HASHES[$i]}"
  if [[ ! -f "${dest}" ]]; then
    download_deb "${dest}" "${URLS[$i]}" "${FILES[$i]}"
  fi
  if verify_deb "${dest}" "${expected}"; then
    continue
  fi
  echo "SHA256 mismatch for cached ${FILES[$i]}; deleting and re-downloading once" >&2
  rm -f "${dest}" "${dest}.partial"
  download_deb "${dest}" "${URLS[$i]}" "${FILES[$i]}"
  if ! verify_deb "${dest}" "${expected}"; then
    echo "SHA256 still mismatched after re-download: ${FILES[$i]}" >&2
    exit 1
  fi
done

if [[ "${POPPLER_SKIP_INSTALL:-}" == "1" ]]; then
  echo "{\"debDir\":\"${DEB_DIR}\",\"packages\":${#PACKAGES[@]},\"skipInstall\":true}"
  exit 0
fi

# Install as one set (manifest order = deps first). --force-confold avoids prompts.
deb_paths=()
for file in "${FILES[@]}"; do
  deb_paths+=("${DEB_DIR}/${file}")
done
sudo dpkg -i --force-confold "${deb_paths[@]}"

for i in "${!PACKAGES[@]}"; do
  installed="$(dpkg-query -W -f='${Version}' "${PACKAGES[$i]}" 2>/dev/null || true)"
  if [[ "${installed}" != "${VERSIONS[$i]}" ]]; then
    echo "expected ${PACKAGES[$i]}=${VERSIONS[$i]}, got '${installed}'" >&2
    exit 1
  fi
done

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "pdftotext missing after Poppler install" >&2
  exit 1
fi

pdftotext -v 2>&1 | head -n 1
echo "{\"debDir\":\"${DEB_DIR}\",\"packages\":${#PACKAGES[@]},\"pdftotext\":\"$(command -v pdftotext)\"}"
