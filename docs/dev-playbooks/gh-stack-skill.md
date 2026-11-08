# Playbook: vendored `gh-stack` agent skill

Keeps the [github/gh-stack](https://github.com/github/gh-stack) Cursor/agent skill in sync with a **pinned** upstream tag, and pins the matching `gh` CLI extension.

## Layout

| Path | Role |
| --- | --- |
| [`.agents/skills/gh-stack/`](../../.agents/skills/gh-stack/) | Vendored skill tree — must stay **byte-identical** to upstream `skills/gh-stack` at the pinned ref |
| [`.agents/vendor/gh-stack.json`](../../.agents/vendor/gh-stack.json) | Pin file: upstream ref, `treeSha`, per-file blob SHAs, extension `--pin` |
| [`scripts/verify-gh-stack-skill.sh`](../../scripts/verify-gh-stack-skill.sh) | Offline verifier (blob SHAs + reconstructed git tree OID) |

Do **not** edit files under `.agents/skills/gh-stack/` by hand (including install-injected frontmatter). Repo-specific guidance belongs in [`AGENTS.md`](../../AGENTS.md) and this playbook.

## Precedence

1. Repo non-negotiables in [`AGENTS.md`](../../AGENTS.md) (default branch **`master`**, product/engine rules).
2. This playbook (pin, update steps, privfina overlays).
3. Vendored skill text under `.agents/skills/gh-stack/`.

## Local extension install (pinned)

```bash
gh extension install github/gh-stack --pin v0.3.0
# or, if already installed:
gh extension upgrade gh-stack --pin v0.3.0
```

The pin value must match `.agents/vendor/gh-stack.json` → `extension.pin` (currently `v0.3.0`). Prefer the pin over a floating `gh extension install github/gh-stack`.

## Verify (also runs in CI)

```bash
npm run verify:gh-stack-skill
# equivalent: ./scripts/verify-gh-stack-skill.sh
```

The script fails if:

- any pinned file is missing, extra, or its `git hash-object` blob differs, or
- reconstructing the git tree OID does not equal `upstream.treeSha`.

## Manual update checklist

1. Pick a new upstream tag (or commit) from [github/gh-stack releases](https://github.com/github/gh-stack/releases). Prefer release tags that match the extension binary you will pin.
2. Fetch the skill tree at that ref:

   ```bash
   git clone --depth 1 --branch <tag> https://github.com/github/gh-stack.git /tmp/gh-stack
   git -C /tmp/gh-stack rev-parse 'HEAD:skills/gh-stack'   # → treeSha
   git -C /tmp/gh-stack ls-tree -r 'HEAD:skills/gh-stack'
   ```

3. Replace `.agents/skills/gh-stack/` with a clean copy of `/tmp/gh-stack/skills/gh-stack/` (no Cursor marketplace rewrite of frontmatter).
4. Update [`.agents/vendor/gh-stack.json`](../../.agents/vendor/gh-stack.json):
   - `upstream.ref`, `upstream.commit`, `upstream.treeSha`
   - `files` map from `git ls-tree -r` blob SHAs
   - `extension.pin` and `extension.install` to the same tag
5. Run `npm run verify:gh-stack-skill` and fix until green.
6. Upgrade local CLI: `gh extension upgrade gh-stack --pin <tag>`.
7. Open a PR that touches only the skill tree + pin file (+ this playbook if steps change). CODEOWNERS requires maintainer review for `.agents/**`.

## Privfina overlays (when following the skill)

- Trunk is **`master`**, not `main` — pass `--base master` on `gh stack init` / `link` when needed.
- Do not set `GH_STACK_NO_ATOMIC`.
- Confirm with a human before `gh stack merge … --yes`, force-with-lease pushes to shared branches, or `gh stack unstack` without `--local`.
- Never delete `gh-stack` lock files under the git common dir to “fix” exit 8.
