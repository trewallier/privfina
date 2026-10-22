import { describe, expect, it } from 'vitest'
import { parseDragPayload, readDropTarget } from '../public/list-dnd.js'

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
})
