# Home-savings deposit interest — event timeline (worked example)

Purpose: show **when** accrual events fire and **how** they change interest and the terminal savings amount. This is a pedagogical miniature with deliberately round numbers. It follows ÁSZF §10 ACT/360 and the engine’s payout-date packaging (ADR 0031); it is **not** a Hirdetmény EBKM golden (real products use 0.10% p.a.).

Engine references: `calculateHomeSavingsDepositInterest`, `resolveHomeSavingsEbkmPayoutDate`, `resolveHomeSavingsMaturityPayoutDate` in `src/finance_engine/instruments/home_savings.ts` / `ebkm.ts`.

## Scenario (chosen so every daily accrual is a round forint)

| Input | Value | Why it is easy to read |
| --- | --- | --- |
| First deposit / start | **2025-01-10** | Mid-month first credit (ÁSZF-exempt from tárgyhó-12); partial first month visible |
| Monthly deposit | **100 000 Ft** | Three easy balances: 100k → 200k → 300k |
| Term | **3** months | Short; only three deposit events |
| Annual deposit rate | **3.60%** | Daily factor = `3.60 / (360 × 100) = 0.0001` → **10 Ft/day** on 100 000 Ft |
| Account fees / Premium / opening fee | **0** here | Isolates interest; real EBKM flows still add those legs |
| Allocation lag | **2** months (ÁSZF §22 / USZ) | Used only to place payout dates |

Deposit anniversaries (clamped month arithmetic):

- 2025-01-10 → 100 000 Ft  
- 2025-02-10 → 100 000 Ft  
- 2025-03-10 → 100 000 Ft (last deposit)

Payout markers used below:

| Marker | Rule | Date in this example |
| --- | --- | --- |
| OTP maturity packaging | First calendar day of month **lastDepositMonth + 2** | **2025-05-01** |
| ÁSZF EBKM packaging | First calendar day of month **lastDepositMonth + 3** | **2025-06-01** |

ÁSZF §10: interest runs from the credit day through the **day before** the payout date used for the amount. The terminal cash-flow date in ADR 0031 EBKM packaging is the ÁSZF EBKM date even when a probe compares a shorter interest end.

## Event table (beginning and end)

Repeated monthly “same accrual every day” rows are omitted; only state changes and the accrual stop matter.

| Date | Event | Balance after event | What happens to interest |
| --- | --- | --- | --- |
| 2025-01-10 | Customer pays first monthly deposit | 100 000 Ft | Accrual **starts today**: +10 Ft this day |
| 2025-02-10 | Customer pays second deposit | 200 000 Ft | Daily accrual jumps to +20 Ft/day from today |
| 2025-03-10 | Customer pays **last** deposit | 300 000 Ft | Daily accrual jumps to +30 Ft/day from today |
| 2025-04-30 | Last day of interest if payout = OTP maturity **2025-05-01** | 300 000 Ft | Still +30 Ft; this is the **last accrual day** for OTP-maturity interest end |
| 2025-05-01 | OTP maturity payout marker | 300 000 Ft | **No** accrual on the payout day itself |
| 2025-05-31 | Last day of interest if payout = ÁSZF EBKM **2025-06-01** | 300 000 Ft | Still +30 Ft; **last accrual day** for ÁSZF interest end |
| 2025-06-01 | ÁSZF EBKM terminal payout date | 300 000 Ft + interest | **No** accrual; terminal savings amount is paid conceptually on this date under ADR 0031 dating |

Capitalization (megtakarítási év → first day after the year, ÁSZF §5/§10) does not fire in this 3-month toy (first cap would be 2026-01-01). On real 4×10 / 8×30 / 10×30 horizons, pending interest is rounded into principal on those cap dates and then compounds.

## Daily accrual formula with numbers

ÁSZF §10:

\[
\text{daily interest} = \text{balance} \times \frac{3.60}{360 \times 100}
\]

So:

- On 100 000 Ft: `100000 × 3.60 / 36000 =` **10 Ft/day**  
- On 200 000 Ft: `200000 × 3.60 / 36000 =` **20 Ft/day**  
- On 300 000 Ft: `300000 × 3.60 / 36000 =` **30 Ft/day**

## Interest from the beginning through each stop

### Segment 1 — after first deposit (100 000 Ft)

From **2025-01-10** through **2025-02-09** inclusive = **31** days at 10 Ft/day:

`31 × 10 =` **310 Ft** pending before the second deposit’s accrual.

On **2025-02-10**, balance becomes 200 000 Ft and that day adds 20 Ft → pending **330 Ft**.

### Segment 2 — after second deposit (200 000 Ft)

From **2025-02-11** through **2025-03-09** = **27** days at 20 Ft/day:

`27 × 20 =` **540 Ft**  
Pending entering 2025-03-10 before today’s accrual: `330 + 540 =` **870 Ft**.

On **2025-03-10**, balance becomes 300 000 Ft; that day adds 30 Ft → pending **900 Ft**.

### Segment 3 — after last deposit (300 000 Ft)

Every later accrual day adds **30 Ft**.

**If interest ends the day before OTP maturity (2025-05-01)** — last accrual day **2025-04-30**:

- Pending at end of 2025-03-10 is already **900 Ft** (includes that day’s 30 Ft).  
- Further days **2025-03-11 … 2025-04-30** = **51** days × 30 Ft = **1 530 Ft**.  
- **Total interest:** `900 + 1530 =` **2 430 Ft**

Engine check: `calculateHomeSavingsDepositInterest(…, payoutDate: 2025-05-01)` → **2 430 Ft**.

**If interest ends the day before ÁSZF EBKM payout (2025-06-01)** — last accrual day **2025-05-31**:

- Extra full month of May after OTP stop: **31** days × 30 Ft = **930 Ft**  
- **Total interest:** `2430 + 930 =` **3 360 Ft**

Engine check: `payoutDate: 2025-06-01` → **3 360 Ft**.

## Final savings amount (no fees / no Premium)

Deposits only: `3 × 100000 =` **300 000 Ft**.

| Interest ends (day before…) | Interest | Terminal savings `K` |
| --- | --- | --- |
| OTP maturity **2025-05-01** | **2 430 Ft** | `300000 + 2430 =` **302 430 Ft** |
| ÁSZF EBKM payout **2025-06-01** | **3 360 Ft** | `300000 + 3360 =` **303 360 Ft** |

Difference: `3360 − 2430 =` **930 Ft** = May’s 31 × 30 Ft. Same deposit schedule and same terminal **calendar date rule family**; only the **interest-end marker** changed. That is the lever ADR 0033’s hybrid probes (ÁSZF terminal **date**, OTP-maturity **interest end**): it changes `K` without moving the labeled payout day.

## What does *not* appear in the tiny table (but matters on real products)

- **Account management fees** continue through allocation (`termMonths + 2` months of fee outflows under ADR 0031 EBKM packaging).  
- **Premium** (OTP Lakástakarék Prémium) is a % of contractual deposits only — added to `K`, not compounded as deposit interest.  
- **Opening fee** is an outflow on start.  
- **EBKM %** is a separate Annex 3 solve on the full dated cash-flow list, **not** the contract deposit rate above. After interest builds terminal `K` (ACT/360), EBKM finds annual `r` such that the NPV of all signed legs is zero, with each time weight  
  `t = (calendar days from first deposit to that leg) / 365`  
  (82/2010 3. melléklet), then prints `r` as a percent with two-decimal half-up. Example shape: opening fee and deposits are negative `A`, terminal `K` is positive `A`; solving `Σ A/(1+r)^t = 0` yields the published-style EBKM. Same solver for 4x10 and 10x30 — shorter horizons are simply closer to half-up boundaries for a given forint error in `K`.  
- **Yearly capitalization** rounds pending interest into balance on the first day after each megtakarítási év (month-1 anchors per ÁSZF §5).

## Reproduce

```bash
npx tsx -e "
import {
  calculateHomeSavingsDepositInterest,
  resolveHomeSavingsEbkmPayoutDate,
  resolveHomeSavingsMaturityPayoutDate
} from './src/finance_engine/engine.ts'
const startDate = '2025-01-10'
const termMonths = 3
const monthlyDeposit = 100000
const annualRatePct = 3.6
const lastDeposit = '2025-03-10'
const aszf = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
const otp = resolveHomeSavingsMaturityPayoutDate({ startDate, termMonths, kiutalasiPeriodMonths: 2 })
for (const payoutDate of [otp, aszf]) {
  const interest = calculateHomeSavingsDepositInterest({
    monthlyDeposit, termMonths, startDate, annualRatePct, payoutDate
  })
  console.log({ payoutDate, interest, K: monthlyDeposit * termMonths + interest })
}
"
```

Expected: OTP `2025-05-01` → interest **2430**, `K` **302430**; ÁSZF `2025-06-01` → interest **3360**, `K` **303360**.
