/**
 * Mouse HTML5 DnD + touch long-press drag for configured-list items/folders.
 *
 * Touch feedback uses a body-mounted `.list-drag-ghost`. Cleanup is global and
 * idempotent so a drop, cancel, or list re-render can never leave a shadow card.
 * Mouse HTML5 uses the browser drag image only (no custom ghost) to avoid leaks
 * when dragend/drop are skipped or synthesized incompletely.
 */

const LONG_PRESS_MS = 400
const MOVE_CANCEL_PX = 10
const DRAG_MIME = 'application/x-privfina-list-drag'
const GHOST_CLASS = 'list-drag-ghost'

let activeDrag = null
let longPressTimer = null
let longPressOrigin = null
let suppressClickUntil = 0
let documentListenersBound = false

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressOrigin = null
}

function isInteractiveDragExclusion(target) {
  // Allow starting a folder drag from the expand/collapse control; block true actions.
  return Boolean(
    target?.closest?.(
      'button:not(.folder-toggle), input, a, label, .folder-edit-row, .flow-card-actions, .action-col'
    )
  )
}

function parseDropIndex(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function parseDragPayload(raw) {
  if (!raw || typeof raw !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    if (parsed.kind !== 'item' && parsed.kind !== 'folder') {
      return null
    }
    if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
      return null
    }
    return { kind: parsed.kind, id: parsed.id.trim() }
  } catch {
    return null
  }
}

function readDropTarget(element) {
  const node = element?.closest?.('[data-drop-target]')
  if (!node) {
    return null
  }

  const type = node.dataset.dropTarget
  if (type === 'folder' || type === 'folder-item') {
    return {
      type: 'folder',
      folderId: node.dataset.folderId,
      index: parseDropIndex(node.dataset.dropIndex)
    }
  }

  if (type === 'root') {
    return {
      type: 'root',
      index: parseDropIndex(node.dataset.dropIndex)
    }
  }

  return null
}

function clearDropHighlights(root) {
  const scopes = [root]
  if (typeof document !== 'undefined') {
    scopes.push(document)
  }
  for (const scope of scopes) {
    scope?.querySelectorAll?.('.is-drop-target')?.forEach((node) => {
      node.classList.remove('is-drop-target')
    })
  }
}

function setDropHighlight(element) {
  const target = element?.closest?.('[data-drop-target]')
  if (!target) {
    return
  }
  target.classList.add('is-drop-target')
}

function removeAllGhosts() {
  if (typeof document === 'undefined') {
    return
  }
  document.querySelectorAll(`.${GHOST_CLASS}`).forEach((node) => {
    node.remove()
  })
}

function releasePointerCapture(drag) {
  if (!drag?.source || drag.pointerId == null) {
    return
  }
  try {
    if (drag.source.hasPointerCapture?.(drag.pointerId)) {
      drag.source.releasePointerCapture(drag.pointerId)
    }
  } catch {
    // Ignore release failures when the node is already detached.
  }
}

function endActiveDrag(root) {
  const drag = activeDrag
  activeDrag = null
  clearLongPress()
  removeAllGhosts()
  clearDropHighlights(root)

  if (drag?.source) {
    drag.source.classList.remove('is-dragging')
    releasePointerCapture(drag)
  }

  // Also clear is-dragging from any stale nodes after a mid-drag re-render.
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.is-dragging').forEach((node) => {
      node.classList.remove('is-dragging')
    })
    document.body.classList.remove('is-list-dragging')
    document.body.classList.remove('is-list-dragging-touch')
  }
}

/**
 * Hard reset used before list re-renders so orphaned ghosts cannot survive DOM rebuilds.
 */
function cancelActiveListDrag(root) {
  endActiveDrag(root)
}

function createGhost(source, clientX, clientY) {
  removeAllGhosts()

  const rect = source.getBoundingClientRect()
  const width = Math.min(rect.width || 280, 320)
  const ghost = document.createElement('div')
  ghost.className = GHOST_CLASS
  ghost.setAttribute('aria-hidden', 'true')

  // <tr> / bare header clones are invalid under body and often render blank — copy text.
  if (source.tagName === 'TR' || source.classList?.contains('folder-header')) {
    const label =
      source.querySelector?.('.folder-name')?.textContent?.trim() ||
      source.querySelector?.('.flow-card-title')?.textContent?.trim() ||
      Array.from(source.querySelectorAll?.('td') || [])
        .map((cell) => cell.textContent.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ') ||
      source.textContent?.trim()?.replace(/\s+/g, ' ').slice(0, 80) ||
      'Moving…'
    ghost.textContent = label
    ghost.style.padding = '10px 12px'
  } else {
    const clone = source.cloneNode(true)
    clone.classList.remove('is-dragging')
    clone.removeAttribute('id')
    clone.removeAttribute('draggable')
    clone.querySelectorAll?.('[id]')?.forEach((node) => node.removeAttribute('id'))
    ghost.appendChild(clone)
  }

  ghost.style.position = 'fixed'
  ghost.style.left = `${clientX - Math.min(24, width / 3)}px`
  ghost.style.top = `${clientY - 16}px`
  ghost.style.width = `${width}px`
  ghost.style.margin = '0'
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '10000'

  document.body.appendChild(ghost)
  return ghost
}

function positionGhost(ghost, clientX, clientY) {
  if (!ghost) {
    return
  }
  ghost.style.left = `${clientX - 24}px`
  ghost.style.top = `${clientY - 16}px`
}

function elementFromPointIgnoringDragChrome(clientX, clientY, drag) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null
  }

  const hidden = []
  const hide = (node) => {
    if (!node || !node.style) {
      return
    }
    hidden.push([node, node.style.visibility, node.style.pointerEvents])
    node.style.visibility = 'hidden'
    node.style.pointerEvents = 'none'
  }

  hide(drag?.ghost)
  hide(drag?.source)

  const under = document.elementFromPoint(clientX, clientY)

  for (const [node, visibility, pointerEvents] of hidden) {
    node.style.visibility = visibility
    node.style.pointerEvents = pointerEvents
  }

  return under
}

function finishTouchDrop(event, root, onDrop) {
  if (!activeDrag || activeDrag.mode !== 'touch') {
    return
  }
  if (activeDrag.pointerId != null && event?.pointerId != null && activeDrag.pointerId !== event.pointerId) {
    return
  }

  const clientX = event?.clientX ?? activeDrag.lastX
  const clientY = event?.clientY ?? activeDrag.lastY
  const under = elementFromPointIgnoringDragChrome(clientX, clientY, activeDrag)
  const target = readDropTarget(under)
  const payload = activeDrag.payload
  endActiveDrag(root)

  if (target && payload && typeof onDrop === 'function') {
    onDrop(payload, target)
  }
}

function onDocumentPointerMove(event) {
  if (longPressOrigin && longPressOrigin.pointerId === event.pointerId) {
    const dx = event.clientX - longPressOrigin.x
    const dy = event.clientY - longPressOrigin.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      clearLongPress()
    }
  }

  if (!activeDrag || activeDrag.mode !== 'touch' || activeDrag.pointerId !== event.pointerId) {
    return
  }

  event.preventDefault()
  activeDrag.lastX = event.clientX
  activeDrag.lastY = event.clientY
  positionGhost(activeDrag.ghost, event.clientX, event.clientY)

  clearDropHighlights(activeDrag.root)
  const under = elementFromPointIgnoringDragChrome(event.clientX, event.clientY, activeDrag)
  setDropHighlight(under)
}

function onDocumentPointerUp(event) {
  if (longPressOrigin && longPressOrigin.pointerId === event.pointerId) {
    clearLongPress()
  }

  if (!activeDrag || activeDrag.mode !== 'touch') {
    // Mouse HTML5 path: if a gesture ends without dragend, still purge leftovers.
    if (!activeDrag || activeDrag.mode === 'html5') {
      removeAllGhosts()
    }
    return
  }

  const root = activeDrag.root
  const onDrop = activeDrag.onDrop
  finishTouchDrop(event, root, onDrop)
}

function onDocumentPointerCancel(event) {
  if (longPressOrigin && longPressOrigin.pointerId === event.pointerId) {
    clearLongPress()
  }
  if (activeDrag?.mode === 'touch') {
    endActiveDrag(activeDrag.root)
  }
}

function onDocumentKeyDown(event) {
  if (event.key === 'Escape') {
    endActiveDrag(activeDrag?.root)
  }
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    endActiveDrag(activeDrag?.root)
  }
}

function onDocumentDragEnd() {
  endActiveDrag(activeDrag?.root)
}

function ensureDocumentListeners() {
  if (documentListenersBound || typeof document === 'undefined') {
    return
  }
  documentListenersBound = true
  document.addEventListener('pointermove', onDocumentPointerMove, { passive: false })
  document.addEventListener('pointerup', onDocumentPointerUp)
  document.addEventListener('pointercancel', onDocumentPointerCancel)
  document.addEventListener('keydown', onDocumentKeyDown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('dragend', onDocumentDragEnd, true)
  window.addEventListener('blur', onVisibilityChange)
}

function bindDraggable(element, payload, onDrop, root) {
  if (!element || !payload) {
    return
  }

  // Re-renders create fresh nodes; still guard against accidental double-bind.
  if (element.dataset.listDndItemBound === '1') {
    element.__privfinaListDrop = onDrop
    element.__privfinaListRoot = root
    return
  }
  element.dataset.listDndItemBound = '1'
  element.__privfinaListDrop = onDrop
  element.__privfinaListRoot = root

  element.setAttribute('draggable', 'true')
  element.dataset.dragKind = payload.kind
  element.dataset.dragId = payload.id

  ensureDocumentListeners()

  element.addEventListener('dragstart', (event) => {
    if (isInteractiveDragExclusion(event.target)) {
      event.preventDefault()
      return
    }

    // Touch long-press owns the gesture; ignore HTML5 drag from the same press.
    if (activeDrag?.mode === 'touch') {
      event.preventDefault()
      return
    }

    const serialized = JSON.stringify(payload)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_MIME, serialized)
    event.dataTransfer.setData('text/plain', serialized)

    endActiveDrag(root)
    suppressClickUntil = Date.now() + 500

    element.classList.add('is-dragging')
    document.body.classList.add('is-list-dragging')
    // No custom ghost for HTML5 — browser drag image is the affordance.
    activeDrag = {
      payload,
      source: element,
      ghost: null,
      mode: 'html5',
      root,
      onDrop
    }
  })

  element.addEventListener('dragend', () => {
    endActiveDrag(root)
  })

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || event.button !== 0) {
      return
    }
    if (isInteractiveDragExclusion(event.target)) {
      return
    }

    clearLongPress()
    longPressOrigin = {
      x: event.clientX,
      y: event.clientY,
      element,
      payload,
      pointerId: event.pointerId,
      root,
      onDrop
    }

    longPressTimer = setTimeout(() => {
      if (!longPressOrigin || longPressOrigin.element !== element) {
        return
      }

      const origin = longPressOrigin
      clearLongPress()
      suppressClickUntil = Date.now() + 500
      endActiveDrag(origin.root)

      const ghost = createGhost(origin.element, origin.x, origin.y)
      origin.element.classList.add('is-dragging')
      document.body.classList.add('is-list-dragging')
      document.body.classList.add('is-list-dragging-touch')
      activeDrag = {
        payload: origin.payload,
        source: origin.element,
        ghost,
        mode: 'touch',
        pointerId: origin.pointerId,
        root: origin.root,
        onDrop: origin.onDrop,
        lastX: origin.x,
        lastY: origin.y
      }

      try {
        origin.element.setPointerCapture(origin.pointerId)
      } catch {
        // Document-level listeners still drive the gesture if capture fails.
      }
    }, LONG_PRESS_MS)
  })

  element.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, true)
}

function bindDropSurface(root, onDrop) {
  if (!root) {
    return
  }

  // Keep the latest callback without stacking listeners across re-renders.
  root.__privfinaListDrop = onDrop
  if (root.dataset.listDndBound === '1') {
    return
  }
  root.dataset.listDndBound = '1'
  ensureDocumentListeners()

  root.addEventListener('dragover', (event) => {
    const target = readDropTarget(event.target)
    if (!target) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    clearDropHighlights(root)
    setDropHighlight(event.target)
  })

  root.addEventListener('dragleave', (event) => {
    if (!root.contains(event.relatedTarget)) {
      clearDropHighlights(root)
    }
  })

  root.addEventListener('drop', (event) => {
    const target = readDropTarget(event.target)
    if (!target) {
      endActiveDrag(root)
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain')
    const payload = parseDragPayload(raw) || activeDrag?.payload
    const handler = root.__privfinaListDrop

    // Clear ghost/highlights before the drop handler re-renders the list.
    endActiveDrag(root)

    if (payload && typeof handler === 'function') {
      handler(payload, target)
    }
  })
}

export {
  bindDraggable,
  bindDropSurface,
  cancelActiveListDrag,
  parseDragPayload,
  readDropTarget,
  LONG_PRESS_MS
}
