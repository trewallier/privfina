import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildConfiguredRows, formatSignedAmount } from '../public/render.js'

const here = dirname(fileURLToPath(import.meta.url))

async function loadResponsiveShellModule() {
  const modulePath = join(here, '../public/controller/responsive-shell.js')
  return import(pathToFileURL(modulePath).href)
}

function createFakeRoot() {
  return {
    dataset: {} as Record<string, string>
  }
}

function createFakeNav(onClick?: (handler: (event: { target: unknown }) => void) => void) {
  const buttons = [
    { getAttribute: () => 'browse', classList: { toggle: () => undefined }, setAttribute: () => undefined },
    { getAttribute: () => 'chart', classList: { toggle: () => undefined }, setAttribute: () => undefined },
    { getAttribute: () => 'add', classList: { toggle: () => undefined }, setAttribute: () => undefined }
  ]

  return {
    hidden: true,
    querySelectorAll: () => buttons,
    addEventListener: (eventName: string, handler: (event: { target: unknown }) => void) => {
      if (eventName === 'click') {
        onClick?.(handler)
      }
    },
    contains: () => true
  }
}

describe('configured flow row model', () => {
  it('builds sorted rows for one-time, recurring, and instrument bundles', () => {
    const rows = buildConfiguredRows(
      [{ id: 'o1', date: '2024-02-01', amount: 10, direction: 'inflow', category: 'bonus' }],
      [
        {
          id: 'r1',
          startDate: '2024-01-01',
          endDate: '2024-03-01',
          period: '0 0 1 * *',
          amount: 5,
          direction: 'outflow',
          category: 'rent'
        }
      ],
      [
        {
          id: 'b1',
          instrumentType: 'salary',
          label: 'Paycheck',
          config: { scheduleMode: 'custom-monthly-working-day' },
          generatedFlows: [
            { date: '2024-01-10', amount: 100, direction: 'inflow', category: 'salary' },
            { date: '2024-02-10', amount: 100, direction: 'inflow', category: 'salary' }
          ]
        }
      ],
      () => true
    )

    expect(rows.map((row) => row.id)).toEqual(['r1', 'b1', 'o1'])
    expect(rows[1]).toMatchObject({
      type: 'salary',
      label: 'Paycheck',
      amount: 200,
      included: true
    })
  })

  it('formats signed amounts for card display', () => {
    expect(formatSignedAmount(12.5, 'inflow')).toBe('+12.50')
    expect(formatSignedAmount(12.5, 'outflow')).toBe('−12.50')
  })
})

describe('responsive shell', () => {
  it('tracks narrow browse/compose/chart views on the root element', async () => {
    const root = createFakeRoot()
    let clickHandler: ((event: { target: unknown }) => void) | undefined
    const nav = createFakeNav((handler) => {
      clickHandler = handler
    })

    const originalMatchMedia = globalThis.matchMedia
    globalThis.matchMedia = () =>
      ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined
      }) as MediaQueryList

    try {
      const { createResponsiveShell } = await loadResponsiveShellModule()
      const shell = createResponsiveShell({ root, mobileNav: nav })
      shell.bindMedia()
      shell.bindMobileNav()

      expect(root.dataset.viewport).toBe('narrow')
      expect(root.dataset.shellView).toBe('browse')

      shell.enterTypePicker()
      expect(root.dataset.shellView).toBe('compose')
      expect(root.dataset.pickingType).toBe('true')

      shell.enterCompose('loan')
      expect(root.dataset.composeType).toBe('loan')
      expect(root.dataset.pickingType).toBe('false')

      const chartButton = {
        closest: () => ({
          getAttribute: () => 'chart'
        })
      }
      clickHandler?.({ target: chartButton })
      expect(root.dataset.shellView).toBe('chart')
    } finally {
      if (originalMatchMedia) {
        globalThis.matchMedia = originalMatchMedia
      } else {
        // @ts-expect-error cleanup stub
        delete globalThis.matchMedia
      }
    }
  })
})

describe('adaptive markup contract', () => {
  it('includes mobile shell landmarks in index.html', () => {
    const html = readFileSync(join(here, '../public/index.html'), 'utf8')
    expect(html).toContain('id="mobile-nav"')
    expect(html).toContain('id="configured-flow-cards"')
    expect(html).toContain('id="add-type-picker"')
    expect(html).toContain('data-shell-view="browse"')
  })
})
