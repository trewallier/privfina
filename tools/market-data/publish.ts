/** Compatibility re-exports — prefer `ingest.ts` / `ingestMarketData`. */
export {
  EXIT_ERROR,
  EXIT_UNCHANGED,
  EXIT_UPDATED,
  ingestMarketData,
  ingestMarketData as publishMarketData,
  type IngestOptions,
  type IngestOptions as PublishOptions,
  type IngestReport,
  type IngestReport as PublishReport
} from './ingest.ts'
