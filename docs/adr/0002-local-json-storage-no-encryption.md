# 0002 — Store private finance data locally in unencrypted JSON (for now)

Status: accepted

Date: 2026-05-26

Context
- Users need to persist personal finance data locally during simulation and between sessions.
- Alternatives considered:
  - Encrypted local file: adds complexity; deferred to later ADR if needed.
  - Cloud database: requires auth, backend, internet; too heavyweight for initial iteration.
  - Password manager: overkill for this use case and limits bulk analytics.
  - SQLite local DB: overkill for initial data volumes; JSON is simpler to inspect and version.
- Goal: Fast iteration, testability, and user transparency; security can be hardened later.

Decision
- Store private finance data in local JSON files under a `data/` directory (not committed to Git).
- Keep JSON unencrypted for now so users can inspect, audit, and backup easily.
- Establish strict `.gitignore` rules to ensure data files are never committed.
- Cloud sync, encryption, and multi-device sync are long-term roadmap items, not part of this change.

Consequences
- **Risk:** Private financial data stored in plaintext on disk. Mitigation: (1) users are responsible for local filesystem permissions and backups, (2) `.gitignore` prevents accidental commits, (3) cloud-safe encryption/sync added as a later milestone.
- **Benefit:** Fast iteration, transparency, easy debugging and auditing.
- **Testing:** Simulations can create and load data quickly without network or credential setup.
- **Future migration:** Cloud sync implementation must include encrypted data format and migration tool from local JSON.

Supersedes
- None (first data storage decision)
