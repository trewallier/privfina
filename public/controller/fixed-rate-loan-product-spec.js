const FIXED_RATE_LOAN_PRODUCT_SPEC = {
  specVersion: 'v1alpha1',
  kind: 'financial-product',
  id: 'loan.fixed-rate.standard',
  family: 'loan',
  variant: 'fixed-rate',
  displayName: 'Fixed Rate Loan',
  description: 'Standard amortizing fixed-rate loan with equal monthly payments.',
  engine: {
    instrumentType: 'loan',
    rateType: 'fixed',
    amortizationType: 'level-payment',
    paymentFrequency: 'monthly'
  },
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      description: 'Initial borrowed amount.',
      constraints: {
        minimum: 1
      }
    },
    {
      name: 'annualInterestRatePct',
      type: 'number',
      label: 'Annual Interest Rate',
      required: true,
      unit: 'percent',
      description: 'Nominal annual fixed interest rate in percent.',
      constraints: {
        minimum: 0,
        maximum: 100
      }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Term in Months',
      required: true,
      unit: 'months',
      description: 'Total number of monthly payments.',
      constraints: {
        minimum: 1
      }
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Start Date',
      required: true,
      unit: 'date',
      description: 'Loan start date in ISO format.'
    }
  ],
  derivedVariables: [
    {
      name: 'monthlyInterestRate',
      type: 'number',
      label: 'Monthly Interest Rate',
      required: false,
      unit: 'rate',
      description: 'Annual interest rate divided by 12 and converted from percent to decimal.'
    }
  ],
  outputs: [
    {
      name: 'monthlyPayment',
      type: 'number',
      label: 'Monthly Payment',
      required: true,
      unit: 'currency',
      description: 'Constant monthly payment amount.'
    },
    {
      name: 'paymentCount',
      type: 'integer',
      label: 'Payment Count',
      required: true,
      unit: 'count',
      description: 'Number of scheduled monthly payments.'
    },
    {
      name: 'totalInterest',
      type: 'number',
      label: 'Total Interest',
      required: true,
      unit: 'currency',
      description: 'Total interest paid over the full term.'
    },
    {
      name: 'totalPaid',
      type: 'number',
      label: 'Total Paid',
      required: true,
      unit: 'currency',
      description: 'Sum of all payments across the full term.'
    }
  ],
  assumptions: [
    'Payments are monthly and occur on a regular monthly cadence.',
    'Interest rate is fixed for the whole term.',
    'No fees, taxes, insurance, grace periods, or prepayments are included in this first pilot.',
    'Rounding policy can remain implementation-defined for now, but should be documented later if needed.'
  ],
  ui: {
    formTitle: 'Fixed Rate Loan',
    sections: [
      {
        id: 'loan-core',
        title: 'Loan Inputs',
        fieldNames: ['principal', 'annualInterestRatePct', 'termMonths', 'startDate']
      }
    ]
  },
  exampleRefs: ['./examples/nominal-case.yaml']
}

export { FIXED_RATE_LOAN_PRODUCT_SPEC }