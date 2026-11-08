#!/usr/bin/env bash
# Verify vendored .agents/skills/gh-stack matches the pinned upstream tree SHA.
# Pin + extension version live in .agents/vendor/gh-stack.json (outside the skill tree).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_FILE="${ROOT}/.agents/vendor/gh-stack.json"

if ! command -v git >/dev/null 2>&1; then
  echo "error: git is required" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required" >&2
  exit 1
fi

python3 - "$ROOT" "$PIN_FILE" <<'PY'
import json
import os
import subprocess
import sys

root, pin_path = sys.argv[1], sys.argv[2]
with open(pin_path, encoding="utf-8") as f:
    pin = json.load(f)

skill_rel = pin["skillPath"]
skill_root = os.path.join(root, skill_rel)
expected_tree = pin["upstream"]["treeSha"]
files = pin["files"]

errors = []

# 1) Exact blob SHAs for every pinned path (and no extras under the skill tree).
found = []
written_blobs = {}
for dirpath, dirnames, filenames in os.walk(skill_root):
    dirnames[:] = sorted(d for d in dirnames if d != ".git")
    for name in sorted(filenames):
        abs_path = os.path.join(dirpath, name)
        rel = os.path.relpath(abs_path, skill_root).replace(os.sep, "/")
        found.append(rel)
        # -w so later git mktree can resolve blob OIDs from this working tree
        actual = subprocess.check_output(
            ["git", "hash-object", "-w", abs_path],
            text=True,
            cwd=root,
        ).strip()
        written_blobs[rel] = actual
        expected = files.get(rel)
        if expected is None:
            errors.append(f"unexpected file in skill tree: {rel} (sha {actual})")
        elif actual != expected:
            errors.append(f"blob mismatch for {rel}: got {actual}, want {expected}")

missing = sorted(set(files) - set(found))
for rel in missing:
    errors.append(f"missing pinned file: {rel}")

# 2) Reconstruct git tree OID bottom-up and compare to upstream treeSha.
def mktree(entries: list[tuple[str, str, str, str]]) -> str:
    # entries: (mode, type, sha, name) — git mktree lines
    payload = "".join(f"{mode} {typ} {sha}\t{name}\n" for mode, typ, sha, name in entries)
    return subprocess.check_output(
        ["git", "mktree"],
        input=payload,
        text=True,
        cwd=root,
    ).strip()

if not errors:
    ref_entries = []
    for rel, sha in sorted(files.items()):
        if not rel.startswith("references/"):
            continue
        name = rel.split("/", 1)[1]
        ref_entries.append(("100644", "blob", sha, name))
    references_tree = mktree(ref_entries)

    top_entries = [
        ("100644", "blob", files["SKILL.md"], "SKILL.md"),
        ("040000", "tree", references_tree, "references"),
    ]
    actual_tree = mktree(top_entries)

    if actual_tree != expected_tree:
        errors.append(
            f"skill tree SHA mismatch: got {actual_tree}, want {expected_tree} "
            f"(upstream {pin['upstream']['ref']} path {pin['upstream']['path']})"
        )

if errors:
    print("gh-stack skill verification FAILED:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    print(
        f"See docs/dev-playbooks/gh-stack-skill.md (pin {pin['extension']['pin']}).",
        file=sys.stderr,
    )
    sys.exit(1)

print(
    f"OK: {skill_rel} matches tree {expected_tree} "
    f"({pin['upstream']['ref']}; extension pin {pin['extension']['pin']})"
)
PY
