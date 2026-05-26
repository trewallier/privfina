# Data Directory

This directory holds private finance data for simulation and persistence. **Data files are never committed to Git and must remain local.**

## Expected Structure

```json
{
  "metadata": {
    "version": "1.0",
    "created": "2026-05-26",
    "updated": "2026-05-26"
  },
  "cash_flows": [
    {
      "date": "2026-06-01",
      "amount": 1000.0,
      "direction": "inflow",
      "category": "salary",
      "description": "Monthly salary"
    },
    {
      "date": "2026-06-05",
      "amount": 50.0,
      "direction": "outflow",
      "category": "subscription",
      "description": "Streaming subscription"
    }
  ]
}
```

## Important

- Keep backups of this directory on a secure device or service.
- Do not share this data over unencrypted channels.
- Cloud sync support is planned; see `ROADMAP.md` for timeline.

## Reference

- See `docs/adr/0002-local-json-storage-no-encryption.md` for the storage strategy and rationale.
