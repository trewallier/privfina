import type { FamilyCode } from './types.ts'

/**
 * ÁKK getPublicOfferings `label` values for in-scope offering families (ADR 0041 / 0044).
 * DKJ and ktv (MÁK) use auctionStart + auctionType=ISSUE instead of ptsStart.
 */
export const OFFERING_LABEL_BY_FAMILY: Record<
  OfferingFamilyCode,
  { label: string; mode: 'tap' | 'auction' }
> = {
  pmap: { label: 'PMAK', mode: 'tap' },
  bmap: { label: 'BMAK', mode: 'tap' },
  fixmap: { label: 'FIX_MAP', mode: 'tap' },
  mapp: { label: 'MAPP_T', mode: 'tap' },
  baba: { label: 'BABA', mode: 'tap' },
  dkj: { label: 'DKJ', mode: 'auction' },
  /** Magyar Államkötvény (MÁK) — display name MÁK; ÁKK label KTV (ADR 0044). */
  ktv: { label: 'KTV', mode: 'auction' }
}

export type OfferingFamilyCode =
  | 'dkj'
  | 'pmap'
  | 'bmap'
  | 'fixmap'
  | 'mapp'
  | 'baba'
  | 'ktv'

export const OFFERING_FAMILIES: readonly OfferingFamilyCode[] = [
  'dkj',
  'pmap',
  'bmap',
  'fixmap',
  'mapp',
  'baba',
  'ktv'
] as const

const LABEL_TO_FAMILY: Record<string, OfferingFamilyCode> = {
  PMAK: 'pmap',
  PMÁP: 'pmap',
  PMAP: 'pmap',
  BMAK: 'bmap',
  BMÁP: 'bmap',
  BMAP: 'bmap',
  FIX_MAP: 'fixmap',
  FIXMAP: 'fixmap',
  FIXMÁP: 'fixmap',
  'FIX MÁP': 'fixmap',
  MAPP_T: 'mapp',
  MAPP: 'mapp',
  'MÁP PLUSZ': 'mapp',
  BABA: 'baba',
  DKJ: 'dkj',
  KTV: 'ktv',
  MAK: 'ktv',
  MÁK: 'ktv'
}

export function isOfferingFamily(family: FamilyCode): family is OfferingFamilyCode {
  return (OFFERING_FAMILIES as readonly string[]).includes(family)
}

export function offeringFamilyFromLabel(label: unknown): OfferingFamilyCode | null {
  if (typeof label !== 'string' || !label.trim()) return null
  const key = label.trim()
  return LABEL_TO_FAMILY[key] ?? LABEL_TO_FAMILY[key.toUpperCase()] ?? null
}

/** Max PDF downloads per security family in a single ingest run (ADR 0041). */
export const MAX_OFFERING_PDF_DOWNLOADS_PER_FAMILY = 10 as const

/**
 * Hard cap on a single offering PDF body (8 MiB).
 * Rejects oversized Content-Length before buffering and streams with a running total
 * so a busy day (≤70 PDF GETs across seven in-scope families) cannot balloon runner
 * memory (ADR 0041 as amended by ADR 0044).
 */
export const MAX_OFFERING_PDF_BYTES = 8 * 1024 * 1024
