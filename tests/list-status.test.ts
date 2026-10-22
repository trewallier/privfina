import { describe, expect, it } from 'vitest'
import {
  buildListOutline,
  createFolder,
  deleteFolder,
  emptyListStatus,
  moveItem,
  moveRootEntry,
  normalizeListStatus,
  reconcileListStatus,
  renameFolder,
  setFolderCollapsed
} from '../public/list-status.js'

describe('list-status', () => {
  it('normalizes empty and corrupt payloads to an empty status', () => {
    expect(normalizeListStatus(null)).toEqual(emptyListStatus())
    expect(normalizeListStatus({ folders: 'bad', rootOrder: null })).toEqual(emptyListStatus())
  })

  it('reconciles missing item ids onto root and drops stale ids', () => {
    const status = {
      folders: [{ id: 'f1', name: 'Bills', collapsed: true }],
      rootOrder: [
        { kind: 'folder', id: 'f1' },
        { kind: 'item', id: 'gone' },
        { kind: 'item', id: 'a' }
      ],
      folderItemOrder: {
        f1: ['b', 'missing'],
        orphan: ['c']
      }
    }

    const reconciled = reconcileListStatus(status, ['a', 'b', 'c'])

    expect(reconciled.folders).toEqual([{ id: 'f1', name: 'Bills', collapsed: true }])
    expect(reconciled.folderItemOrder.f1).toEqual(['b'])
    expect(reconciled.folderItemOrder.orphan).toBeUndefined()
    expect(reconciled.rootOrder).toEqual([
      { kind: 'folder', id: 'f1' },
      { kind: 'item', id: 'a' },
      { kind: 'item', id: 'c' }
    ])
  })

  it('creates, renames, collapses, and deletes folders (delete moves children to root)', () => {
    let status = reconcileListStatus(emptyListStatus(), ['a', 'b'])
    status = createFolder(status, 'Housing')
    const folderId = status.folders[0].id

    status = moveItem(status, 'a', { type: 'folder', folderId })
    status = moveItem(status, 'b', { type: 'folder', folderId, index: 0 })
    status = renameFolder(status, folderId, 'Home')
    status = setFolderCollapsed(status, folderId, true)

    expect(status.folders[0]).toMatchObject({ name: 'Home', collapsed: true })
    expect(status.folderItemOrder[folderId]).toEqual(['b', 'a'])

    status = deleteFolder(status, folderId)
    expect(status.folders).toEqual([])
    expect(status.rootOrder.map((entry) => entry.id)).toEqual(['b', 'a'])
  })

  it('builds a render outline from status and row map', () => {
    const status = {
      folders: [{ id: 'f1', name: 'Group', collapsed: false }],
      rootOrder: [
        { kind: 'item', id: 'x' },
        { kind: 'folder', id: 'f1' }
      ],
      folderItemOrder: { f1: ['y'] }
    }
    const rowsById = new Map([
      ['x', { id: 'x', label: 'X' }],
      ['y', { id: 'y', label: 'Y' }]
    ])

    expect(buildListOutline(status, rowsById)).toEqual([
      { type: 'item', row: { id: 'x', label: 'X' } },
      {
        type: 'folder',
        folder: { id: 'f1', name: 'Group', collapsed: false },
        items: [{ id: 'y', label: 'Y' }]
      }
    ])
  })

  it('reorders within the same folder using pre-move insert-before indices', () => {
    let status = reconcileListStatus(emptyListStatus(), ['a', 'b', 'c'])
    status = createFolder(status, 'Group')
    const folderId = status.folders[0].id
    status = moveItem(status, 'a', { type: 'folder', folderId })
    status = moveItem(status, 'b', { type: 'folder', folderId })
    status = moveItem(status, 'c', { type: 'folder', folderId })
    expect(status.folderItemOrder[folderId]).toEqual(['a', 'b', 'c'])

    // Move a onto c (insert before c's pre-move index 2) → a lands before c.
    status = moveItem(status, 'a', { type: 'folder', folderId, index: 2 })
    expect(status.folderItemOrder[folderId]).toEqual(['b', 'a', 'c'])

    // Move c onto b (b is at index 0) → c before b.
    status = moveItem(status, 'c', { type: 'folder', folderId, index: 0 })
    expect(status.folderItemOrder[folderId]).toEqual(['c', 'b', 'a'])
  })

  it('reorders root entries with the same insert-before semantics', () => {
    let status = reconcileListStatus(emptyListStatus(), ['a', 'b', 'c'])
    status = createFolder(status, 'Group')
    const folderId = status.folders[0].id
    // rootOrder: a, b, c, folder
    status = moveRootEntry(status, { kind: 'item', id: 'a' }, 2)
    expect(status.rootOrder.map((entry) => entry.id)).toEqual(['b', 'a', 'c', folderId])

    status = moveRootEntry(status, { kind: 'folder', id: folderId }, 0)
    expect(status.rootOrder.map((entry) => entry.id)).toEqual([folderId, 'b', 'a', 'c'])
  })
})
