/**
 * Shared (non-product) investment UI field help.
 * Catalog product field help must come from product YAML
 * `inputs[].description` / `outputs[].description` via embedded specs — do not
 * mirror product fields here (ADR 0038 review / SoT ownership).
 */

const SHARED_INVESTMENT_UI_HELP = {
  label: 'Friendly name for this instrument row in the configured list.',
  category: 'Optional tag for grouping this instrument in lists and reports.',
  description: 'Optional free-text notes for this investment instrument.',
  subtype: 'Select a generic bond subtype or a catalog government-security product.'
}

function getSharedInvestmentFieldHelp(fieldName) {
  return SHARED_INVESTMENT_UI_HELP[fieldName] || ''
}

export { SHARED_INVESTMENT_UI_HELP, getSharedInvestmentFieldHelp }
