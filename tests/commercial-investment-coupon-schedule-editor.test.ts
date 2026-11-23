/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampCouponRatePct,
  deriveCouponScheduleTos,
  isFixedCouponSchedule,
  mountCouponScheduleEditor,
  resetCouponScheduleEditorsForTests,
  resolveAnnualCouponRatePctFromRows,
  setActiveCouponScheduleEditor
} from '../public/controller/commercial-investment-coupon-schedule-editor.js'

describe('commercial-investment-coupon-schedule-editor helpers', () => {
  it('treats empty, single, and uniform rates as fixed', () => {
    expect(isFixedCouponSchedule([])).toBe(true)
    expect(isFixedCouponSchedule([{ from: '2026-01-01', rate: 5 }])).toBe(true)
    expect(
      isFixedCouponSchedule([
        { from: '2026-01-01', rate: 5 },
        { from: '2027-01-01', rate: 5 }
      ])
    ).toBe(true)
  })

  it('treats divergent defined rates as stepped', () => {
    expect(
      isFixedCouponSchedule([
        { from: '2026-01-01', rate: 5 },
        { from: '2027-01-01', rate: 6 }
      ])
    ).toBe(false)
  })

  it('clamps rates into 0–100 with two-decimal rounding', () => {
    expect(clampCouponRatePct('-1')).toBe('0')
    expect(clampCouponRatePct('150')).toBe('100')
    expect(clampCouponRatePct('6.255')).toBe('6.26')
    expect(clampCouponRatePct('')).toBe('')
  })

  it('derives to as the day before the next from; last to is null', () => {
    expect(
      deriveCouponScheduleTos([
        { from: '2027-08-03', rate: 7 },
        { from: '2026-08-03', rate: 6.5 },
        { from: '2028-08-03', rate: 7.5 }
      ])
    ).toEqual([
      { from: '2026-08-03', to: '2027-08-02', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-02', rate: 7 },
      { from: '2028-08-03', to: null, rate: 7.5 }
    ])
  })

  it('resolves covering annual rate at purchase, else first defined', () => {
    const rows = [
      { from: '2026-08-03', to: '2027-08-02', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-02', rate: 7 },
      { from: '2028-08-03', to: null, rate: 7.5 }
    ]
    expect(resolveAnnualCouponRatePctFromRows(rows, '2027-02-03')).toBe(6.5)
    expect(resolveAnnualCouponRatePctFromRows(rows, '2027-09-01')).toBe(7)
    expect(resolveAnnualCouponRatePctFromRows(rows, '')).toBe(6.5)
  })
})

describe('commercial-investment-coupon-schedule-editor DOM', () => {
  function buildHost(prefix: string) {
    document.body.innerHTML = `
      <form id="commercial-investment-form">
        <div id="investment-${prefix}-wrap">
          <input id="${prefix}-purchase-date" name="purchaseDate" type="date" value="2027-02-03" />
          <input id="${prefix}-issue-date" name="issueDate" type="date" value="2026-08-03" />
          <div id="${prefix}-coupon-schedule-editor"></div>
          <div class="coupon-engine-sync" hidden>
            <input id="${prefix}-annual-coupon-rate-pct" name="annualCouponRatePct" type="hidden" value="" />
            <input id="${prefix}-first-coupon-date" name="firstCouponDate" type="hidden" value="" />
            <input id="${prefix}-coupon-schedule" name="couponSchedule" type="hidden" value="" />
          </div>
        </div>
      </form>
    `
    const form = document.getElementById('commercial-investment-form') as HTMLFormElement
    const root = document.getElementById(`${prefix}-coupon-schedule-editor`) as HTMLElement
    const editor = mountCouponScheduleEditor(prefix, root, form)
    editor?.setHostActive(true)
    return { form, root, editor: editor! }
  }

  beforeEach(() => {
    resetCouponScheduleEditorsForTests()
    document.body.innerHTML = ''
  })

  it('propagates Rate edits to all rows in fix mode and serializes schedule', () => {
    const { form, editor } = buildHost('pmap')
    editor.setSchedule(
      [
        { from: '2026-08-03', rate: 6.5 },
        { from: '2027-08-03', rate: 6.5 }
      ],
      { reevaluateMode: true }
    )
    expect(editor.isFixedMode()).toBe(true)

    const rateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.coupon-schedule-rate')
    )
    rateInputs[0].value = '7.25'
    rateInputs[0].dispatchEvent(new Event('change', { bubbles: true }))

    expect(editor.getRows().map((row) => row.rate)).toEqual([7.25, 7.25])
    const schedule = JSON.parse(
      (form.querySelector('#pmap-coupon-schedule') as HTMLInputElement).value
    )
    expect(schedule).toEqual([
      { from: '2026-08-03', to: '2027-08-02', rate: 7.25 },
      { from: '2027-08-03', to: null, rate: 7.25 }
    ])
    expect((form.querySelector('#pmap-annual-coupon-rate-pct') as HTMLInputElement).value).toBe(
      '7.25'
    )
    expect((form.querySelector('#pmap-first-coupon-date') as HTMLInputElement).value).toBe(
      '2026-08-03'
    )
  })

  it('keeps Rate edits independent in stepped mode', () => {
    const { editor } = buildHost('fixmap')
    editor.setSchedule(
      [
        { from: '2026-08-03', rate: 6.5 },
        { from: '2027-08-03', rate: 7 }
      ],
      { reevaluateMode: true }
    )
    expect(editor.isFixedMode()).toBe(false)

    const rateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.coupon-schedule-rate')
    )
    rateInputs[1].value = '8'
    rateInputs[1].dispatchEvent(new Event('change', { bubbles: true }))

    expect(editor.getRows().map((row) => row.rate)).toEqual([6.5, 8])
  })

  it('syncs firstCouponDate from the earliest sorted From, not UI row order', () => {
    const { form, editor } = buildHost('bmap')
    editor.setSchedule(
      [
        { from: '2027-08-03', rate: 7 },
        { from: '2026-08-03', rate: 6.5 }
      ],
      { reevaluateMode: true }
    )
    editor.syncHiddenFields()
    expect((form.querySelector('#bmap-first-coupon-date') as HTMLInputElement).value).toBe(
      '2026-08-03'
    )
    const schedule = JSON.parse(
      (form.querySelector('#bmap-coupon-schedule') as HTMLInputElement).value
    )
    expect(schedule[0].from).toBe('2026-08-03')
  })

  it('locks controls when market-sourced annual/schedule flags are set', () => {
    const { form, editor } = buildHost('mapp')
    const annual = form.querySelector('#mapp-annual-coupon-rate-pct') as HTMLInputElement
    const schedule = form.querySelector('#mapp-coupon-schedule') as HTMLInputElement
    annual.value = '5'
    schedule.value = JSON.stringify([{ from: '2026-01-01', to: null, rate: 5 }])
    annual.dataset.marketSourced = 'true'
    schedule.dataset.marketSourced = 'true'
    editor.loadFromHidden()

    const rateInput = document.querySelector<HTMLInputElement>('.coupon-schedule-rate')
    expect(rateInput?.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('.coupon-schedule-add')?.disabled).toBe(true)
  })

  it('inactive host editors do not block form checkValidity', () => {
    document.body.innerHTML = `
      <form id="commercial-investment-form">
        <div id="investment-pmap-wrap">
          <input id="pmap-purchase-date" type="date" value="2027-02-03" />
          <input id="pmap-issue-date" type="date" value="2026-08-03" />
          <div id="pmap-coupon-schedule-editor"></div>
          <input id="pmap-annual-coupon-rate-pct" name="annualCouponRatePct" type="hidden" />
          <input id="pmap-first-coupon-date" name="firstCouponDate" type="hidden" />
          <input id="pmap-coupon-schedule" name="couponSchedule" type="hidden" />
        </div>
        <div id="investment-bmap-wrap" hidden>
          <input id="bmap-purchase-date" type="date" value="2027-02-03" />
          <input id="bmap-issue-date" type="date" value="2026-08-03" />
          <div id="bmap-coupon-schedule-editor"></div>
          <input id="bmap-annual-coupon-rate-pct" name="annualCouponRatePct" type="hidden" />
          <input id="bmap-first-coupon-date" name="firstCouponDate" type="hidden" />
          <input id="bmap-coupon-schedule" name="couponSchedule" type="hidden" />
        </div>
        <input name="principal" value="100000" required />
      </form>
    `
    const form = document.getElementById('commercial-investment-form') as HTMLFormElement
    const pmapRoot = document.getElementById('pmap-coupon-schedule-editor') as HTMLElement
    const bmapRoot = document.getElementById('bmap-coupon-schedule-editor') as HTMLElement
    const pmapEditor = mountCouponScheduleEditor('pmap', pmapRoot, form)!
    const bmapEditor = mountCouponScheduleEditor('bmap', bmapRoot, form)!
    pmapEditor.setSchedule([{ from: '2026-08-03', rate: 6.5 }])
    // Leave bmap empty — would fail if its required rate stayed active.
    bmapEditor.setSchedule([])

    setActiveCouponScheduleEditor(form, 'pmap')

    const pmapRate = pmapRoot.querySelector<HTMLInputElement>('.coupon-schedule-rate')
    const bmapRate = bmapRoot.querySelector<HTMLInputElement>('.coupon-schedule-rate')
    expect(pmapEditor.getRows()[0]?.rate).toBe(6.5)
    expect(pmapRate?.value).toBe('6.5')
    expect(pmapRate?.required).toBe(true)
    expect(bmapRate?.required).toBe(false)
    expect(bmapRate?.disabled).toBe(true)
    expect(form.checkValidity()).toBe(true)
  })
})
