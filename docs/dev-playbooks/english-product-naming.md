# English product naming

English is the primary language for product specs, UI chrome, docs, ADRs, and code comments. Hungarian appears only as a clarity gloss or as an untranslated abbreviation / official document title.

Follow the government-securities pattern already used for ÁKK retail offerings, then apply the same rules to loans and home-savings.

## Rules

1. **Product marketing / UI title (`displayName`, `ui.formTitle`):**
   - Prefer `English Name (ABBREV)` when the market handle is an abbreviation (e.g. `Discount Treasury Bond (DKJ)`).
   - Prefer `English Name (Hungarian marketing name)` when no official English brand exists for foreign customers (e.g. `OTP Green Home Loan (Zöld Lakáshitel)`).
2. **First mention in docs or field help:** English term, then Hungarian gloss in parentheses when the legal or marketing source is Hungarian-only.
3. **Never translate abbreviations.** Keep `DKJ`, `PMÁP`, `BMÁP`, `ÁKK`, `THM`, `EBKM`, `CSOK`, `LTP`, `ÁSZF`, `USZ`. Expand the full English phrase once for clarity (do not expand only the abbreviation).
4. **Machine IDs stay unchanged:** `productCode`, fee `name` slugs (`folyositasi-dij`, …), folder names, YAML `variant`.
5. **YAML is source of truth** for `displayName`, labels, and descriptions. Keep embedded `public/controller/*` mirrors in sync (parity tests).
6. **Hungarian source document titles** stay as proper nouns with an English gloss (e.g. published tariff notice (Hirdetmény)). Do not invent fake English statute names.
7. **UI fee / field labels** use professional English banking terms. Add a Hungarian parenthetical only when the English term alone would be ambiguous for this market.

Issuer phrasing for treasury products: **ÁKK / Hungarian State Treasury**.

## Product glossary

| English display | Keep / gloss |
| --- | --- |
| Discount Treasury Bond (DKJ) | Diszkont Kincstárjegy |
| Premium Hungarian Government Security (PMÁP) | Prémium Magyar Állampapír |
| Bonus Hungarian Government Security (BMÁP) | Bónusz Magyar Állampapír |
| Home Savings (LTP / lakástakarékpénztár) | lakás-előtakarékosság |
| OTP Home Savings Premium Plus 10x30 (Lakástakarék PRÉMIUM PLUSZ 10x30) | — |
| OTP Home Savings Premium Plus 4x10 (Lakástakarék PRÉMIUM PLUSZ 4x10) | — |
| OTP Home Savings Premium Plus 8x30 (Lakástakarék PRÉMIUM PLUSZ 8x30) | — |
| OTP Home Savings Premium 4x10 (Lakástakarék PRÉMIUM 4x10) | — |
| OTP Home Savings Premium 8x30 (Lakástakarék PRÉMIUM 8x30) | — |
| OTP 1x1 Home Loan (1x1 Lakáshitel) | — |
| OTP Green Home Loan (Zöld Lakáshitel) | — |
| OTP Fixed-for-Term Home Loan (Végig Fix Lakáshitel) | — |
| OTP Year-Saver CSOK Plus Home Loan (Évnyerő CSOK Plusz Lakáshitel) | — |
| OTP Home-Creation Loan — Village CSOK (Falusi CSOK / Otthonteremtési Lakáshitel) | — |
| OTP Year-Saver Home Start Loan (Évnyerő Otthon Start Lakáshitel) | — |
| OTP Rural Home Renovation Loan (Vidéki Otthonfelújítási Lakáshitel) | — |
| Family Housing Allowance (CSOK) | — |
| Village CSOK (Falusi CSOK) | — |
| Home Start (Otthon Start) | — |

## Legal and bank source docs

| English | Hungarian proper noun |
| --- | --- |
| Published tariff notice | Hirdetmény |
| General Terms and Conditions | ÁSZF |
| Deposit interest rate sheet annex | USZ Melléklet |

## Rate and fee jargon

| English | Hungarian gloss (when needed) |
| --- | --- |
| Contractual interest rate | ügyleti kamat |
| Customer-payable interest rate | adósok által fizetendő kamat |
| Disbursement fee | Folyósítási díj |
| Collateral appraisal fee | Hitelbiztosítéki érték-megállapítás |
| Instant valuation | Azonnali értékbecslés |
| Collateral administration fee | Fedezetkezelési költség |
| Collateral change fee | Fedezetváltozási költség |
| Title-deed extract fee | Tulajdoni lap lekérés |
| Cadastral-map extract fee | Térképmásolat lekérés |
| One-time rate-reduction fee | Egyszeri kamatcsökkentés díj |
| Loyalty service | Hűség szolgáltatás |
| Green rate discount | Zöld kamatkedvezmény |
| Discounted-fee campaign | Díjkedvezményes akció |
| Contractual amount | szerződéses összeg |
| Monthly deposit | betét |
| Product scheme | módozat |
| Savings period | megtakarítási idő |
| Allocation / payout | kiutalás |
| Bridging loan | áthidaló kölcsön |
| LTP home loan | lakáskölcsön |
| Interest / principal / interest rate | kamat / tőke / kamatláb |
| Grace / interest-only period | türelmi idő |
| APR indicator (THM) | teljes hiteldíj mutató |
| Unified deposit rate indicator (EBKM) | egységesített betéti kamatlábmutató |
| HUF million | mFt |
| HUF/month | Ft/hó |

## README title pattern

Product README H1 for catalog offerings with an official Hungarian name:

```markdown
# English Name / Hungarian Name (ABBREV)
```

Example: `# Premium Hungarian Government Security / Prémium Magyar Állampapír (PMÁP)`.

When there is no stable abbreviation, use:

```markdown
# English Name (Hungarian marketing name)
```
