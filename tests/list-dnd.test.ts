import { describe, expect, it } from 'vitest'
import {
  clampGhostOrigin,
  LONG_PRESS_MS,
  MOVE_CANCEL_PX,
  parseDragPayload,
  readDropTarget,
  SCROLL_CLAIM_MS
} from '../public/list-dnd.js'

function dropNode(dataset) {
  const node = {
    dataset,
    closest(selector) {
      if (selector === '[data-drop-target]' && dataset.dropTarget) {
        return node
      }
      return null
    }
  }
  return node
}

describe('list-dnd helpers', () => {
  it('parses valid drag payloads and rejects corrupt ones', () => {
    expect(parseDragPayload(JSON.stringify({ kind: 'item', id: 'abc' }))).toEqual({
      kind: 'item',
      id: 'abc'
    })
    expect(parseDragPayload(JSON.stringify({ kind: 'folder', id: ' f1 ' }))).toEqual({
      kind: 'folder',
      id: 'f1'
    })
    expect(parseDragPayload('not-json')).toBeNull()
    expect(parseDragPayload(JSON.stringify({ kind: 'item' }))).toBeNull()
    expect(parseDragPayload(JSON.stringify({ kind: 'bundle', id: 'x' }))).toBeNull()
  })

  it('reads folder, folder-item, and root drop targets', () => {
    expect(
      readDropTarget(
        dropNode({
          dropTarget: 'root',
          dropIndex: '2'
        })
      )
    ).toEqual({ type: 'root', index: 2 })

    expect(
      readDropTarget(
        dropNode({
          dropTarget: 'folder',
          folderId: 'f1',
          dropIndex: '3'
        })
      )
    ).toEqual({ type: 'folder', folderId: 'f1', index: 3 })

    expect(
      readDropTarget(
        dropNode({
          dropTarget: 'folder-item',
          folderId: 'f1',
          dropIndex: '1'
        })
      )
    ).toEqual({ type: 'folder', folderId: 'f1', index: 1 })

    expect(readDropTarget(dropNode({}))).toBeNull()
    expect(readDropTarget(null)).toBeNull()
  })

  it('clamps ghost origin inside the viewport so drag chrome cannot widen the page', () => {
    const previousInnerWidth = globalThis.innerWidth
    const previousInnerHeight = globalThis.innerHeight
    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 800 })

    expect(clampGhostOrigin(380, 10, 300, 60, 24, 16)).toEqual({
      x: 86,
      y: 4
    })
    expect(clampGhostOrigin(-40, -20, 300, 60, 24, 16)).toEqual({
      x: 4,
      y: 4
    })
    expect(clampGhostOrigin(200, 400, 300, 60, 24, 16)).toEqual({
      x: 86,
      y: 384
    })

    // Invalid widths must not disable clamping (NaN/0 would previously push ghosts off-screen).
    expect(clampGhostOrigin(380, 10, Number.NaN, 60, 24, 16).x).toBeLessThanOrEqual(386)
    expect(clampGhostOrigin(380, 10, 0, 60, 24, 16).x).toBeLessThanOrEqual(386)

    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: previousInnerWidth })
    Object.defineProperty(globalThis, 'innerHeight', {
      configurable: true,
      value: previousInnerHeight
    })
  })

  it('keeps touch claim thresholds in a mobile-friendly band', () => {
    expect(MOVE_CANCEL_PX).toBeGreaterThanOrEqual(12)
    expect(SCROLL_CLAIM_MS).toBeGreaterThanOrEqual(120)
    expect(SCROLL_CLAIM_MS).toBeLessThan(LONG_PRESS_MS)
  })
})
