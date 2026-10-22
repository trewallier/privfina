/**
 * Persisted configured-list organization: flat folders, item order, collapse state.
 * Domain cash-flow records stay separate; this module only owns outline UI state.
 */

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyListStatus() {
  return {
    folders: [],
    rootOrder: [],
    folderItemOrder: {}
  }
}

function normalizeFolder(folder) {
  if (!folder || typeof folder !== 'object') {
    return null
  }

  const id = typeof folder.id === 'string' && folder.id.trim() ? folder.id.trim() : null
  if (!id) {
    return null
  }

  const name = String(folder.name || '').trim() || 'Folder'
  return {
    id,
    name,
    collapsed: Boolean(folder.collapsed)
  }
}

function normalizeRootEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const kind = entry.kind === 'folder' ? 'folder' : entry.kind === 'item' ? 'item' : null
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null
  if (!kind || !id) {
    return null
  }

  return { kind, id }
}

function normalizeListStatus(raw) {
  if (!raw || typeof raw !== 'object') {
    return emptyListStatus()
  }

  const folders = Array.isArray(raw.folders)
    ? raw.folders.map(normalizeFolder).filter((folder) => folder !== null)
    : []

  const seenFolderIds = new Set()
  const uniqueFolders = []
  for (const folder of folders) {
    if (seenFolderIds.has(folder.id)) {
      continue
    }
    seenFolderIds.add(folder.id)
    uniqueFolders.push(folder)
  }

  const rootOrder = Array.isArray(raw.rootOrder)
    ? raw.rootOrder.map(normalizeRootEntry).filter((entry) => entry !== null)
    : []

  const folderItemOrder = {}
  const sourceFolderItemOrder =
    raw.folderItemOrder && typeof raw.folderItemOrder === 'object' ? raw.folderItemOrder : {}

  for (const [folderId, itemIds] of Object.entries(sourceFolderItemOrder)) {
    if (!seenFolderIds.has(folderId) || !Array.isArray(itemIds)) {
      continue
    }

    const seenItems = new Set()
    folderItemOrder[folderId] = []
    for (const itemId of itemIds) {
      if (typeof itemId !== 'string' || !itemId.trim() || seenItems.has(itemId)) {
        continue
      }
      seenItems.add(itemId)
      folderItemOrder[folderId].push(itemId.trim())
    }
  }

  for (const folder of uniqueFolders) {
    if (!folderItemOrder[folder.id]) {
      folderItemOrder[folder.id] = []
    }
  }

  return {
    folders: uniqueFolders,
    rootOrder,
    folderItemOrder
  }
}

/**
 * Seed root order from an explicit preferred id sequence when status has no outline yet.
 */
function seedListStatusOrder(listStatus, orderedItemIds) {
  const status = normalizeListStatus(listStatus)
  if (status.rootOrder.length > 0 || status.folders.length > 0) {
    return status
  }

  const seen = new Set()
  const rootOrder = []
  for (const itemId of orderedItemIds || []) {
    if (typeof itemId !== 'string' || !itemId.trim() || seen.has(itemId)) {
      continue
    }
    seen.add(itemId)
    rootOrder.push({ kind: 'item', id: itemId.trim() })
  }

  return {
    ...status,
    rootOrder
  }
}

/**
 * Reconcile listStatus against known configured-flow / instrument ids.
 * Missing ids are appended to root; stale ids are dropped; orphan folder contents move to root.
 */
function reconcileListStatus(listStatus, knownItemIds) {
  const status = normalizeListStatus(listStatus)
  const known = new Set(
    (Array.isArray(knownItemIds) ? knownItemIds : [])
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim())
  )

  const folderById = new Map(status.folders.map((folder) => [folder.id, folder]))
  const claimedItems = new Set()
  const nextFolderItemOrder = {}

  for (const folder of status.folders) {
    const nextItems = []
    for (const itemId of status.folderItemOrder[folder.id] || []) {
      if (!known.has(itemId) || claimedItems.has(itemId)) {
        continue
      }
      claimedItems.add(itemId)
      nextItems.push(itemId)
    }
    nextFolderItemOrder[folder.id] = nextItems
  }

  const nextRootOrder = []
  const seenRootKeys = new Set()

  for (const entry of status.rootOrder) {
    if (entry.kind === 'folder') {
      if (!folderById.has(entry.id) || seenRootKeys.has(`folder:${entry.id}`)) {
        continue
      }
      seenRootKeys.add(`folder:${entry.id}`)
      nextRootOrder.push(entry)
      continue
    }

    if (!known.has(entry.id) || claimedItems.has(entry.id) || seenRootKeys.has(`item:${entry.id}`)) {
      continue
    }
    claimedItems.add(entry.id)
    seenRootKeys.add(`item:${entry.id}`)
    nextRootOrder.push(entry)
  }

  for (const folder of status.folders) {
    if (!seenRootKeys.has(`folder:${folder.id}`)) {
      nextRootOrder.push({ kind: 'folder', id: folder.id })
      seenRootKeys.add(`folder:${folder.id}`)
    }
  }

  for (const itemId of known) {
    if (claimedItems.has(itemId)) {
      continue
    }
    nextRootOrder.push({ kind: 'item', id: itemId })
    claimedItems.add(itemId)
  }

  return {
    folders: status.folders,
    rootOrder: nextRootOrder,
    folderItemOrder: nextFolderItemOrder
  }
}

function createFolder(listStatus, name = 'Folder') {
  const status = normalizeListStatus(listStatus)
  const folder = {
    id: createId('folder'),
    name: String(name || '').trim() || 'Folder',
    collapsed: false
  }

  return {
    ...status,
    folders: [...status.folders, folder],
    rootOrder: [...status.rootOrder, { kind: 'folder', id: folder.id }],
    folderItemOrder: {
      ...status.folderItemOrder,
      [folder.id]: []
    }
  }
}

function renameFolder(listStatus, folderId, name) {
  const status = normalizeListStatus(listStatus)
  const nextName = String(name || '').trim() || 'Folder'

  return {
    ...status,
    folders: status.folders.map((folder) =>
      folder.id === folderId ? { ...folder, name: nextName } : folder
    )
  }
}

function setFolderCollapsed(listStatus, folderId, collapsed) {
  const status = normalizeListStatus(listStatus)

  return {
    ...status,
    folders: status.folders.map((folder) =>
      folder.id === folderId ? { ...folder, collapsed: Boolean(collapsed) } : folder
    )
  }
}

/**
 * Delete folder and move its items to root (immediately after the removed folder slot).
 */
function deleteFolder(listStatus, folderId) {
  const status = normalizeListStatus(listStatus)
  const childIds = status.folderItemOrder[folderId] || []
  const nextFolders = status.folders.filter((folder) => folder.id !== folderId)
  const nextFolderItemOrder = { ...status.folderItemOrder }
  delete nextFolderItemOrder[folderId]

  const nextRootOrder = []
  for (const entry of status.rootOrder) {
    if (entry.kind === 'folder' && entry.id === folderId) {
      for (const itemId of childIds) {
        nextRootOrder.push({ kind: 'item', id: itemId })
      }
      continue
    }
    nextRootOrder.push(entry)
  }

  return {
    folders: nextFolders,
    rootOrder: nextRootOrder,
    folderItemOrder: nextFolderItemOrder
  }
}

function removeItemFromStatus(listStatus, itemId) {
  const status = normalizeListStatus(listStatus)
  const nextRootOrder = status.rootOrder.filter(
    (entry) => !(entry.kind === 'item' && entry.id === itemId)
  )
  const nextFolderItemOrder = {}
  for (const [folderId, itemIds] of Object.entries(status.folderItemOrder)) {
    nextFolderItemOrder[folderId] = itemIds.filter((id) => id !== itemId)
  }

  return {
    ...status,
    rootOrder: nextRootOrder,
    folderItemOrder: nextFolderItemOrder
  }
}

function findItemLocation(listStatus, itemId) {
  const status = normalizeListStatus(listStatus)
  const rootIndex = status.rootOrder.findIndex(
    (entry) => entry.kind === 'item' && entry.id === itemId
  )
  if (rootIndex >= 0) {
    return { container: 'root', index: rootIndex, folderId: null }
  }

  for (const [folderId, itemIds] of Object.entries(status.folderItemOrder)) {
    const index = itemIds.indexOf(itemId)
    if (index >= 0) {
      return { container: 'folder', index, folderId }
    }
  }

  return null
}

/**
 * Move an item into a folder (append or insert at index) or to root at index.
 * target: { type: 'folder', folderId, index? } | { type: 'root', index? }
 */
function moveItem(listStatus, itemId, target) {
  if (typeof itemId !== 'string' || !itemId.trim() || !target || typeof target !== 'object') {
    return normalizeListStatus(listStatus)
  }

  let status = removeItemFromStatus(listStatus, itemId)

  if (target.type === 'folder') {
    const folderId = target.folderId
    if (!status.folders.some((folder) => folder.id === folderId)) {
      return status
    }

    const items = [...(status.folderItemOrder[folderId] || [])]
    const index =
      Number.isInteger(target.index) && target.index >= 0
        ? Math.min(target.index, items.length)
        : items.length
    items.splice(index, 0, itemId)

    return {
      ...status,
      folderItemOrder: {
        ...status.folderItemOrder,
        [folderId]: items
      }
    }
  }

  const rootOrder = [...status.rootOrder]
  const index =
    Number.isInteger(target.index) && target.index >= 0
      ? Math.min(target.index, rootOrder.length)
      : rootOrder.length
  rootOrder.splice(index, 0, { kind: 'item', id: itemId })

  return {
    ...status,
    rootOrder
  }
}

/**
 * Reorder a root entry (folder or unfiled item) to a new root index.
 */
function moveRootEntry(listStatus, entry, toIndex) {
  const status = normalizeListStatus(listStatus)
  if (!entry || (entry.kind !== 'folder' && entry.kind !== 'item')) {
    return status
  }

  const fromIndex = status.rootOrder.findIndex(
    (candidate) => candidate.kind === entry.kind && candidate.id === entry.id
  )
  if (fromIndex < 0) {
    return status
  }

  const nextRootOrder = [...status.rootOrder]
  const [removed] = nextRootOrder.splice(fromIndex, 1)
  const index =
    Number.isInteger(toIndex) && toIndex >= 0
      ? Math.min(toIndex, nextRootOrder.length)
      : nextRootOrder.length
  nextRootOrder.splice(index, 0, removed)

  return {
    ...status,
    rootOrder: nextRootOrder
  }
}

/**
 * Build a flat render outline from reconciled status + row map.
 * Returns [{ type: 'folder', folder, items: row[] } | { type: 'item', row }]
 */
function buildListOutline(listStatus, rowsById) {
  const status = normalizeListStatus(listStatus)
  const outline = []
  const folderMap = new Map(status.folders.map((folder) => [folder.id, folder]))

  for (const entry of status.rootOrder) {
    if (entry.kind === 'folder') {
      const folder = folderMap.get(entry.id)
      if (!folder) {
        continue
      }

      const items = []
      for (const itemId of status.folderItemOrder[folder.id] || []) {
        const row = rowsById.get(itemId)
        if (row) {
          items.push(row)
        }
      }

      outline.push({ type: 'folder', folder, items })
      continue
    }

    const row = rowsById.get(entry.id)
    if (row) {
      outline.push({ type: 'item', row })
    }
  }

  return outline
}

export {
  emptyListStatus,
  normalizeListStatus,
  seedListStatusOrder,
  reconcileListStatus,
  createFolder,
  renameFolder,
  setFolderCollapsed,
  deleteFolder,
  removeItemFromStatus,
  findItemLocation,
  moveItem,
  moveRootEntry,
  buildListOutline,
  createId
}
