/**
 * Migration scaffolding: upfront fee / selectable discount blocks for the commercial
 * loan composer. Mirrored from docs/product-specs/products/loans/<productCode>/product.yaml
 * (keep in sync via commercial-loan-composer-parity tests; full embedded YAML parity is
 * the later fully-spec-backed slice).
 */

const COMMERCIAL_LOAN_COMMERCIAL_BLOCKS = {
  "otp-1x1": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Instant valuation (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Title-deed extract fee",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Cadastral-map extract fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "One-time rate-reduction fee (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Loyalty service (−120 bp)"
      },
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP discounted-fee campaign disbursement waiver"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "One-time rate-reduction fee waiver"
      }
    ],
    "defaultActiveDiscountNames": []
  },
  "otp-zold": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Instant valuation (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "One-time rate-reduction fee (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "zold-kamatkedvezmeny",
        "type": "rate-discount",
        "value": 50,
        "unit": "bp",
        "label": "Green rate discount (−50 bp)"
      },
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Loyalty service (−120 bp)"
      },
      {
        "name": "otp-zold-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP Green disbursement fee waiver"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "appliesToFeeNames": [
          "egyszeri-kamatcsokkentes-dij"
        ],
        "label": "One-time rate-reduction fee waiver"
      }
    ],
    "defaultActiveDiscountNames": [
      "otp-zold-folyositasi-dij-elengedes"
    ]
  },
  "vegig-fix": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Instant valuation (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Title-deed extract fee",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Cadastral-map extract fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "One-time rate-reduction fee (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Loyalty service (−120 bp)"
      },
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-csokkentes",
        "type": "fee-waiver",
        "value": 87.5,
        "unit": "percent",
        "label": "OTP discounted-fee campaign disbursement reduction"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "One-time rate-reduction fee waiver"
      }
    ],
    "defaultActiveDiscountNames": []
  },
  "csok-plusz": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 300000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Title-deed extract fee",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Cadastral-map extract fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      }
    ],
    "discounts": [
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-csokkentes",
        "type": "fee-waiver",
        "value": 91.67,
        "unit": "percent",
        "label": "OTP discounted-fee campaign disbursement reduction"
      }
    ],
    "defaultActiveDiscountNames": []
  },
  "falusi-csok": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 1,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Title-deed extract fee",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Cadastral-map extract fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      }
    ],
    "discounts": [],
    "defaultActiveDiscountNames": []
  },
  "otthon-start": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 30000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Title-deed extract fee",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Cadastral-map extract fee",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral change fee",
        "optional": false
      }
    ],
    "discounts": [
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP discounted-fee campaign disbursement waiver"
      }
    ],
    "defaultActiveDiscountNames": []
  },
  "videki-otthonfelujitasi": {
    "fees": [
      {
        "name": "folyositasi-dij",
        "type": "disbursement",
        "value": 0.75,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Disbursement fee",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral appraisal fee",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Collateral administration fee",
        "optional": false
      }
    ],
    "discounts": [],
    "defaultActiveDiscountNames": []
  }
}

function getCommercialLoanCommercialBlocks(productCode) {
  return COMMERCIAL_LOAN_COMMERCIAL_BLOCKS[productCode] || { fees: [], discounts: [], defaultActiveDiscountNames: [] }
}

export { COMMERCIAL_LOAN_COMMERCIAL_BLOCKS, getCommercialLoanCommercialBlocks }
