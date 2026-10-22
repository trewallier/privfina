# create-adr.prompt.md

Purpose: Scaffold a new ADR from a short decision description.

Instructions for the assistant:
- Produce a new ADR file content using `docs/adr/template.md` structure.
- Populate Title, Context, Decision, Consequences, Date (today), and set Status to `proposed`.
- Suggest a filename using the next available sequential number (e.g. `0002-...`).
- Follow [`docs/adr/README.md`](../../docs/adr/README.md): ADRs on `master` are read-only (supersede with a new ADR). Do **not** add a superseding ADR in the same PR that introduced the original — edit the in-flight ADR instead.

Example input (from user):
"We will switch monthly aggregation to use end-of-month anchoring for salary payments because payroll is paid on last business day." 

Example output: the full ADR Markdown body ready to be saved as `docs/adr/0002-...`.
