import type { FamilyCode } from './types.ts'

const TYPE_TO_FAMILY: Record<string, FamilyCode> = {
  DKJ: 'dkj',
  PMÁP: 'pmap',
  PMAP: 'pmap',
  BMÁP: 'bmap',
  BMAP: 'bmap',
  FIXMÁP: 'fixmap',
  FIXMAP: 'fixmap',
  'FIX MÁP': 'fixmap',
  KTV: 'ktv',
  'MÁP PLUSZ': 'mapp',
  'MAP PLUSZ': 'mapp',
  MÁPP: 'mapp',
  MAPP: 'mapp',
  MÁPP_T: 'mapp',
  MAPP_T: 'mapp',
  BABA: 'baba',
  EMÁP: 'emap',
  EMAP: 'emap',
  PEMÁP: 'emap',
  PEMAP: 'emap',
  '1MAP': 'omap',
  '1MÁP': 'omap',
  OMAP: 'omap'
}

/** Map ÁKK / allampapir securityType values to published family folder codes. */
export function familyFromSecurityType(securityType: unknown): FamilyCode | null {
  if (typeof securityType !== 'string') return null
  const key = securityType.trim()
  if (!key) return null
  const upper = key.toUpperCase().replace(/\s+/g, ' ')
  return TYPE_TO_FAMILY[key] ?? TYPE_TO_FAMILY[upper] ?? null
}

/**
 * Route an allampapir paper code + optional row securityType to a family.
 * MAP paper mixes subtypes — prefer row securityType; other papers have defaults.
 */
export function familyFromAllampapirPaper(
  paper: string,
  securityType?: unknown
): FamilyCode | null {
  const fromType = familyFromSecurityType(securityType)
  if (fromType) return fromType
  const p = paper.trim().toUpperCase()
  switch (p) {
    case 'DKJ':
      return 'dkj'
    case 'MAP':
      // Must have securityType on rows; no default dump into ktv.
      return null
    case 'MAPP':
      return 'mapp'
    case 'BABA':
      return 'baba'
    case 'EMAP':
      return 'emap'
    case '1MAP':
      return 'omap'
    default:
      return familyFromSecurityType(p)
  }
}

export const AKK_SECURITY_TYPES = ['DKJ', 'PMÁP', 'BMÁP'] as const
