/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampCouponRatePct,
  deriveCouponScheduleTos,
  isFixedCouponSchedule,
  mountCouponScheduleEditor,
  periodRowLabel,
  resetCouponScheduleEditorsForTests,
  resolveAnnualCouponRatePctFromRows,
  resolveFirstCouponDateFromSchedule,
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

  it('derives to as the day before the next from when missing; last to is null', () => {
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

  it('preserves explicit published to values (including equal to next from)', () => {
    expect(
      deriveCouponScheduleTos([
        { from: '2026-08-03', to: '2027-08-03', rate: 6.5 },
        { from: '2027-08-03', to: '2028-08-03', rate: 7 },
        { from: '2028-08-03', to: null, rate: 7.5 }
      ])
    ).toEqual([
      { from: '2026-08-03', to: '2027-08-03', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-03', rate: 7 },
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

  it('maps firstCouponDate from second From, else day after to, else preserved payment', () => {
    expect(
      resolveFirstCouponDateFromSchedule(
        [
          { from: '2026-08-03', to: '2027-08-02', rate: 6.5 },
          { from: '2027-08-03', to: null, rate: 7 }
        ],
        '2099-01-01'
      )
    ).toBe('2027-08-03')
    expect(
      resolveFirstCouponDateFromSchedule([{ from: '2026-08-03', to: '2027-08-02', rate: 6.5 }], '')
    ).toBe('2027-08-03')
    expect(
      resolveFirstCouponDateFromSchedule(
        [{ from: '2026-08-03', to: null, rate: 6.5 }],
        '2027-08-03'
      )
    ).toBe('2027-08-03')
    expect(periodRowLabel(0)).toBe('Issue / period start')
    expect(periodRowLabel(1)).toBe('First coupon')
    expect(periodRowLabel(2)).toBe('Period 3')
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
      '2027-08-03'
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

  it('syncs firstCouponDate from the second sorted From', () => {
    const { form, editor, root } = buildHost('bmap')
    editor.setSchedule(
      [
        { from: '2027-08-03', rate: 7 },
        { from: '2026-08-03', rate: 6.5 }
      ],
      { reevaluateMode: true }
    )
    editor.syncHiddenFields()
    expect((form.querySelector('#bmap-first-coupon-date') as HTMLInputElement).value).toBe(
      '2027-08-03'
    )
    const schedule = JSON.parse(
      (form.querySelector('#bmap-coupon-schedule') as HTMLInputElement).value
    )
    expect(schedule[0].from).toBe('2026-08-03')
    expect(schedule[1].from).toBe('2027-08-03')
    const captions = Array.from(root.querySelectorAll('.coupon-schedule-period-caption')).map(
      (el) => el.textContent
    )
    expect(captions.slice(0, 2)).toEqual(['Issue / period start', 'First coupon'])
  })

  it('seeds issue + first-coupon rows when only firstCouponDate is present', () => {
    const { form, editor } = buildHost('baba')
    const annual = form.querySelector('#baba-annual-coupon-rate-pct') as HTMLInputElement
    const first = form.querySelector('#baba-first-coupon-date') as HTMLInputElement
    annual.value = '7.4'
    first.value = '2027-02-01'
    editor.loadFromHidden()
    expect(editor.getRows()).toEqual([
      { from: '2026-08-03', rate: 7.4, to: null },
      { from: '2027-02-01', rate: 7.4, to: null }
    ])
    expect(first.value).toBe('2027-02-01')
  })

  it('keeps autofill payment date on a single open schedule band', () => {
    const { form, editor } = buildHost('ktv')
    const annual = form.querySelector('#ktv-annual-coupon-rate-pct') as HTMLInputElement
    const first = form.querySelector('#ktv-first-coupon-date') as HTMLInputElement
    const schedule = form.querySelector('#ktv-coupon-schedule') as HTMLInputElement
    annual.value = '6.25'
    first.value = '2026-09-23'
    schedule.value = JSON.stringify([{ from: '2026-02-18', to: null, rate: 6.25 }])
    editor.loadFromHidden()
    expect(editor.getRows()).toEqual([{ from: '2026-02-18', rate: 6.25, to: null }])
    expect(first.value).toBe('2026-09-23')
  })

  it('preserves published to on load/serialize and excludes inactive host FormData names', () => {
    document.body.innerHTML = `
      <form id="commercial-investment-form">
        <div id="investment-pmap-wrap" hidden>
          <input id="pmap-purchase-date" type="date" value="2027-02-03" />
          <input id="pmap-issue-date" type="date" value="2026-08-03" />
          <div id="pmap-coupon-schedule-editor"></div>
          <input id="pmap-annual-coupon-rate-pct" name="annualCouponRatePct" type="hidden" disabled />
          <input id="pmap-first-coupon-date" name="firstCouponDate" type="hidden" disabled />
          <input id="pmap-coupon-schedule" name="couponSchedule" type="hidden" disabled />
          <input id="pmap-day-count-convention" name="dayCountConvention" type="hidden" disabled />
        </div>
        <div id="investment-bmap-wrap">
          <input id="bmap-purchase-date" type="date" value="2027-02-03" />
          <input id="bmap-issue-date" type="date" value="2026-08-03" />
          <div id="bmap-coupon-schedule-editor"></div>
          <input id="bmap-annual-coupon-rate-pct" name="annualCouponRatePct" type="hidden" />
          <input id="bmap-first-coupon-date" name="firstCouponDate" type="hidden" />
          <input id="bmap-coupon-schedule" name="couponSchedule" type="hidden" />
          <input id="bmap-day-count-convention" name="dayCountConvention" type="hidden" value="ACT/360" />
        </div>
      </form>
    `
    const form = document.getElementById('commercial-investment-form') as HTMLFormElement
    const pmapRoot = document.getElementById('pmap-coupon-schedule-editor') as HTMLElement
    const bmapRoot = document.getElementById('bmap-coupon-schedule-editor') as HTMLElement
    const pmapEditor = mountCouponScheduleEditor('pmap', pmapRoot, form)!
    const bmapEditor = mountCouponScheduleEditor('bmap', bmapRoot, form)!
    pmapEditor.setSchedule([
      { from: '2020-01-01', to: '2021-01-01', rate: 1 },
      { from: '2021-01-01', to: null, rate: 1 }
    ])
    bmapEditor.setSchedule([
      { from: '2026-08-03', to: '2027-08-03', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-03', rate: 7 }
    ])
    setActiveCouponScheduleEditor(form, 'bmap')
    // Mirror host: inactive engine-sync inputs stay disabled.
    ;(form.querySelector('#pmap-coupon-schedule') as HTMLInputElement).disabled = true
    ;(form.querySelector('#bmap-coupon-schedule') as HTMLInputElement).disabled = false

    const schedule = JSON.parse(
      (form.querySelector('#bmap-coupon-schedule') as HTMLInputElement).value
    )
    expect(schedule[0].to).toBe('2027-08-03')
    expect(schedule[1].to).toBe('2028-08-03')

    const formData = new FormData(form)
    expect(formData.get('couponSchedule')).toBe(
      (form.querySelector('#bmap-coupon-schedule') as HTMLInputElement).value
    )
    expect(formData.get('dayCountConvention')).toBe('ACT/360')
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

  it('renders compact icon-only remove and labeled add with visible chrome classes', () => {
    const { root, editor } = buildHost('pmap')
    editor.setSchedule(
      [
        { from: '2026-08-03', rate: 6.5 },
        { from: '2027-08-03', rate: 6.5 }
      ],
      { reevaluateMode: true }
    )

    const removeBtns = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.coupon-schedule-remove')
    )
    expect(removeBtns).toHaveLength(2)
    for (const [index, btn] of removeBtns.entries()) {
      expect(btn.classList.contains('icon-button')).toBe(true)
      expect(btn.classList.contains('danger')).toBe(true)
      expect(btn.getAttribute('aria-label')).toBe(`Remove period ${index + 1}`)
      expect(btn.title).toBe(`Remove period ${index + 1}`)
      expect(btn.textContent?.trim()).toBe('')
      expect(btn.querySelector('svg')).not.toBeNull()
    }

    const addBtn = root.querySelector<HTMLButtonElement>('.coupon-schedule-add')
    expect(addBtn).not.toBeNull()
    expect(addBtn?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Add period')
    expect(addBtn?.querySelector('svg')).not.toBeNull()

    const captions = Array.from(root.querySelectorAll('.coupon-schedule-period-caption')).map(
      (el) => el.textContent
    )
    expect(captions.slice(0, 2)).toEqual(['Issue / period start', 'First coupon'])
    expect(root.querySelector('.coupon-schedule-header')).not.toBeNull()
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
