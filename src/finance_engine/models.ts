export enum CashFlowDirection {
  Inflow = 'inflow',
  Outflow = 'outflow'
}

export type InstrumentType = 'salary' | 'subscription' | 'loan' | 'investment' | 'home-savings'

export interface CashFlow {
  date: string
  amount: number
  direction: CashFlowDirection
  category: string
  description?: string
}

/** Dated cash flow materialised into an instrument bundle, with lineage back to the source instrument. */
export interface GeneratedCashFlow extends CashFlow {
  id?: string
  sourceInstrumentId?: string
  sourceInstrumentType?: InstrumentType
}

/**
 * Persisted instrument workflow unit (ADR 0012).
 * Inputs live in `config`; charting consumes `generatedFlows`.
 * `productId` / `productSpecVersion` record the product-spec contract used when known (ADR 0013).
 */
export interface InstrumentBundle {
  id: string
  instrumentType: InstrumentType
  label: string
  config: Record<string, unknown>
  preview?: unknown
  generatedFlows: GeneratedCashFlow[]
  createdAt: string
  updatedAt: string
  productId?: string
  productSpecVersion?: string
}
