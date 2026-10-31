import type { FamilyCode } from './types.ts'

const TYPE_TO_FAMILY: Record<string, FamilyCode> = {
  DKJ: 'dkj',
  PMÁP: 'pmap',
  PMAP: 'pmap',
  BMÁP: 'bmap',
  BMAP: 'bmap'
}

/** Map ÁKK securityType / type filter values to published family folder codes. */
export function familyFromSecurityType(securityType: unknown): FamilyCode | null {
  if (typeof securityType !== 'string') return null
  const key = securityType.trim()
  return TYPE_TO_FAMILY[key] ?? TYPE_TO_FAMILY[key.toUpperCase()] ?? null
}

export const AKK_SECURITY_TYPES = ['DKJ', 'PMÁP', 'BMÁP'] as const
