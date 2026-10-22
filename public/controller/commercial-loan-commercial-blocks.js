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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Azonnali értékbecslés (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Tulajdoni lap lekérés",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Térképmásolat lekérés",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Egyszeri kamatcsökkentés díj (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Hűség szolgáltatás (−120 bp)"
      },
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP Díjkedvezményes folyósítási díj elengedés"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "Egyszeri kamatcsökkentés díj elengedés"
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Azonnali értékbecslés (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Egyszeri kamatcsökkentés díj (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "zold-kamatkedvezmeny",
        "type": "rate-discount",
        "value": 50,
        "unit": "bp",
        "label": "Zöld kamatkedvezmény (−50 bp)"
      },
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Hűség szolgáltatás (−120 bp)"
      },
      {
        "name": "otp-zold-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP Zöld folyósítási díj elengedés"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "appliesToFeeNames": [
          "egyszeri-kamatcsokkentes-dij"
        ],
        "label": "Egyszeri kamatcsökkentés díj elengedés"
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "azonnali-ertekbecsles",
        "type": "appraisal",
        "value": 21980,
        "unit": "amount",
        "timing": "upfront",
        "label": "Azonnali értékbecslés (optional)",
        "optional": true
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Tulajdoni lap lekérés",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Térképmásolat lekérés",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
        "optional": false
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij",
        "type": "other",
        "value": 2,
        "unit": "percent",
        "maxAmount": 200000,
        "timing": "upfront",
        "label": "Egyszeri kamatcsökkentés díj (optional)",
        "optional": true
      }
    ],
    "discounts": [
      {
        "name": "huseg-szolgaltatas",
        "type": "rate-discount",
        "value": 120,
        "unit": "bp",
        "label": "Hűség szolgáltatás (−120 bp)"
      },
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-csokkentes",
        "type": "fee-waiver",
        "value": 87.5,
        "unit": "percent",
        "label": "OTP Díjkedvezményes folyósítási díj csökkentés"
      },
      {
        "name": "egyszeri-kamatcsokkentes-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "Egyszeri kamatcsökkentés díj elengedés"
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Tulajdoni lap lekérés",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Térképmásolat lekérés",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
        "optional": false
      }
    ],
    "discounts": [
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-csokkentes",
        "type": "fee-waiver",
        "value": 91.67,
        "unit": "percent",
        "label": "OTP Díjkedvezményes folyósítási díj csökkentés"
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Tulajdoni lap lekérés",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Térképmásolat lekérés",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
        "optional": false
      },
      {
        "name": "tulajdoni-lap-lekeres",
        "type": "land-registry",
        "value": 9600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Tulajdoni lap lekérés",
        "optional": false
      },
      {
        "name": "terkepmasolat-lekeres",
        "type": "land-registry",
        "value": 5000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Térképmásolat lekérés",
        "optional": false
      },
      {
        "name": "fedezetvaltozasi-koltseg",
        "type": "land-registry",
        "value": 10600,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetváltozási költség",
        "optional": false
      }
    ],
    "discounts": [
      {
        "name": "otp-dijkedvezmenyes-folyositasi-dij-elengedes",
        "type": "fee-waiver",
        "value": 100,
        "unit": "percent",
        "label": "OTP Díjkedvezményes folyósítási díj elengedés"
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
        "label": "Folyósítási díj",
        "optional": false
      },
      {
        "name": "hitelbiztositeki-ertek-megallapitas",
        "type": "appraisal",
        "value": 58765,
        "unit": "amount",
        "timing": "upfront",
        "label": "Hitelbiztosítéki érték-megállapítás",
        "optional": false
      },
      {
        "name": "fedezetkezelesi-koltseg",
        "type": "property-management",
        "value": 20000,
        "unit": "amount",
        "timing": "upfront",
        "label": "Fedezetkezelési költség",
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
