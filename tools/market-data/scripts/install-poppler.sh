#!/usr/bin/env bash
# Download (if needed), SHA256-verify, and install pinned Poppler debs from poppler.manifest.
# Fail closed on hash mismatch or unexpected installed versions.
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

checksum_file="$(mktemp)"
trap 'rm -f "${checksum_file}"' EXIT

for i in "${!FILES[@]}"; do
  dest="${DEB_DIR}/${FILES[$i]}"
  if [[ ! -f "${dest}" ]]; then
    echo "Downloading ${FILES[$i]}"
    curl -fsSL --retry 3 --retry-delay 2 -o "${dest}.partial" "${URLS[$i]}"
    mv "${dest}.partial" "${dest}"
  fi
  printf '%s  %s\n' "${HASHES[$i]}" "${dest}" >> "${checksum_file}"
done

sha256sum -c "${checksum_file}"

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
