export enum CashFlowDirection {
  Inflow = 'inflow',
  Outflow = 'outflow'
}

export interface CashFlow {
  date: string
  amount: number
  direction: CashFlowDirection
  category: string
  description?: string
}
