import { describe, expect, it } from 'vitest'
import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  IMPORT_GENERATED_FLOWS_POLICY,
  buildExportDocument,
  migrateImportDataToCurrent,
  migrateInstrumentBundlesToSchemaV4,
  parseImportDocument
} from '../public/import-export.js'
import { generateLoanInstrumentBundle } from '../public/instruments.js'
import { emptyListStatus } from '../public/list-status.js'

describe('import/export schema v5', () => {
  it('exports the current schema version as v5 with listStatus', () => {
    expect(CURRENT_EXPORT_SCHEMA_VERSION).toBe(5)
    expect(IMPORT_GENERATED_FLOWS_POLICY).toBe('trust-stored')

    const doc = buildExportDocument([], [], '2026-10-16T00:00:00.000Z')
    expect(doc.schemaVersion).toBe(5)
    expect(doc.data.instrumentBundles).toEqual([])
    expect(doc.data.listStatus).toEqual(emptyListStatus())
  })

  it('round-trips instrument bundles and listStatus', () => {
    const bundle = generateLoanInstrumentBundle({
      id: 'loan-roundtrip-1',
      label: 'Car loan',
      productId: 'loan.fixed-rate.standard',
      productSpecVersion: 'v2alpha1',
      principal: 1200,
      annualRate: 0,
      termValue: 3,
      termUnit: 'months',
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan',
      createdAt: '2026-01-01T00:00:00.000Z'
    })

    const listStatus = {
      folders: [{ id: 'folder-1', name: 'Loans', collapsed: true }],
      rootOrder: [
        { kind: 'folder', id: 'folder-1' },
        { kind: 'item', id: 'one-1' }
      ],
      folderItemOrder: {
        'folder-1': ['loan-roundtrip-1']
      }
    }

    const exported = buildExportDocument(
      [{ id: 'one-1', date: '2026-01-15', amount: 50, direction: 'outflow', category: 'misc' }],
      [],
      [bundle],
      listStatus,
      '2026-10-16T12:00:00.000Z'
    )

    expect(exported.schemaVersion).toBe(5)
    expect(exported.data.instrumentBundles).toHaveLength(1)
    expect(exported.data.listStatus).toEqual(listStatus)
    expect(exported.data.instrumentBundles[0].productId).toBe('loan.fixed-rate.standard')
    expect(exported.data.instrumentBundles[0].generatedFlows[0]).toMatchObject({
      id: 'loan-roundtrip-1-flow-0',
      sourceInstrumentId: 'loan-roundtrip-1',
      sourceInstrumentType: 'loan'
    })

    const imported = parseImportDocument(exported)

    expect(imported.schemaVersion).toBe(5)
    expect(imported.warnings).toEqual([])
    expect(imported.importGeneratedFlowsPolicy).toBe('trust-stored')
    expect(imported.oneTimeFlows).toHaveLength(1)
    expect(imported.instrumentBundles).toHaveLength(1)
    expect(imported.listStatus).toEqual(listStatus)

    const restored = imported.instrumentBundles[0]
    expect(restored.id).toBe(bundle.id)
    expect(restored.createdAt).toBe(bundle.createdAt)
    expect(restored.productId).toBe(bundle.productId)
    expect(restored.productSpecVersion).toBe(bundle.productSpecVersion)
    expect(restored.generatedFlows.map((flow) => ({ date: flow.date, amount: flow.amount, direction: flow.direction }))).toEqual(
      bundle.generatedFlows.map((flow) => ({ date: flow.date, amount: flow.amount, direction: flow.direction }))
    )
    expect(restored.generatedFlows.every((flow) => flow.sourceInstrumentId === bundle.id)).toBe(true)
  })

  it('migrates explicit schema v2 payloads to v5 with empty instrument bundles and listStatus', () => {
    const imported = parseImportDocument({
      kind: 'privfina.export',
      schemaVersion: 2,
      exportedAt: '2026-05-01T00:00:00.000Z',
      data: {
        oneTimeCashFlows: [{ id: 'a', date: '2024-01-01', amount: 100, direction: 'inflow', category: 'salary' }],
        recurringCashFlows: [
          {
            id: 'r1',
            period: '0 0 15 * *',
            startDate: '2024-01-01',
            occurrences: 1,
            amount: 10,
            direction: 'outflow',
            category: 'bills'
          }
        ]
      }
    })

    expect(imported.schemaVersion).toBe(5)
    expect(imported.oneTimeFlows).toHaveLength(1)
    expect(imported.recurringFlows).toHaveLength(1)
    expect(imported.instrumentBundles).toEqual([])
    expect(imported.listStatus).toEqual(emptyListStatus())
    expect(imported.warnings.some((entry) => entry.includes('schema v2'))).toBe(true)
    expect(imported.warnings.some((entry) => entry.includes('schema v3'))).toBe(true)
    expect(imported.warnings.some((entry) => entry.includes('schema v4'))).toBe(true)
  })

  it('upgrades schema v3 bundles with lineage metadata while preserving stored amounts', () => {
    const legacyV3Bundle = {
      id: 'loan-legacy-v3',
      instrumentType: 'loan',
      label: 'Legacy loan',
      config: {
        productId: 'loan.fixed-rate.standard',
        productSpecVersion: 'v2alpha1',
        principal: 1000
      },
      generatedFlows: [
        { date: '2026-01-01', amount: 1000, direction: 'inflow', category: 'loan' },
        { date: '2026-02-01', amount: 333.33, direction: 'outflow', category: 'loan' }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z'
    }

    const migratedBundles = migrateInstrumentBundlesToSchemaV4([legacyV3Bundle])
    expect(migratedBundles[0].productId).toBe('loan.fixed-rate.standard')
    expect(migratedBundles[0].generatedFlows[0]).toMatchObject({
      date: '2026-01-01',
      amount: 1000,
      id: 'loan-legacy-v3-flow-0',
      sourceInstrumentId: 'loan-legacy-v3',
      sourceInstrumentType: 'loan'
    })
    expect(migratedBundles[0].generatedFlows[1].amount).toBe(333.33)

    const imported = parseImportDocument({
      kind: 'privfina.export',
      schemaVersion: 3,
      exportedAt: '2026-09-01T00:00:00.000Z',
      data: {
        oneTimeCashFlows: [],
        recurringCashFlows: [],
        instrumentBundles: [legacyV3Bundle]
      }
    })

    expect(imported.schemaVersion).toBe(5)
    expect(imported.warnings.some((entry) => entry.includes('stored cash-flow amounts were preserved'))).toBe(
      true
    )
    expect(imported.listStatus).toEqual(emptyListStatus())
    expect(imported.instrumentBundles[0].generatedFlows.map((flow) => flow.amount)).toEqual([1000, 333.33])
    expect(imported.instrumentBundles[0].generatedFlows[0].sourceInstrumentId).toBe('loan-legacy-v3')
  })

  it('migrates schema v4 to v5 with empty listStatus', () => {
    const imported = parseImportDocument({
      kind: 'privfina.export',
      schemaVersion: 4,
      exportedAt: '2026-10-01T00:00:00.000Z',
      data: {
        oneTimeCashFlows: [{ id: 'a', date: '2024-01-01', amount: 100, direction: 'inflow', category: 'salary' }],
        recurringCashFlows: [],
        instrumentBundles: []
      }
    })

    expect(imported.schemaVersion).toBe(5)
    expect(imported.listStatus).toEqual(emptyListStatus())
    expect(imported.warnings.some((entry) => entry.includes('listStatus'))).toBe(true)
  })

  it('keeps migrateImportDataToCurrent stepwise through v1→v5', () => {
    const migrated = migrateImportDataToCurrent(1, {
      oneTimeCashFlows: [{ date: '2024-01-01', amount: 1, direction: 'inflow' }],
      recurringCashFlows: []
    })

    expect(migrated.schemaVersion).toBe(5)
    expect(migrated.data.instrumentBundles).toEqual([])
    expect(migrated.data.listStatus).toEqual(emptyListStatus())
    expect(migrated.warnings.length).toBeGreaterThanOrEqual(4)
  })
})
