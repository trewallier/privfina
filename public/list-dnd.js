/**
 * Mouse HTML5 DnD + touch long-press drag for configured-list items/folders.
 *
 * Touch feedback uses a viewport-clipped `.list-drag-layer` + `.list-drag-ghost`.
 * Cleanup is global and idempotent so a drop, cancel, or list re-render can never
 * leave a shadow card. Mouse HTML5 uses the browser drag image only (no custom
 * ghost) to avoid leaks when dragend/drop are skipped or synthesized incompletely.
 *
 * Mobile notes:
 * - HTML5 `draggable` is enabled only for mouse presses (avoids iOS native-drag artifacts).
 * - Touch long-press claims the gesture after a short stillness window and locks
 *   document scroll via non-passive `touchmove` preventDefault (Android otherwise
 *   scrolls mid-drag and cancels the pointer before a drop can land).
 */

const LONG_PRESS_MS = 400
const SCROLL_CLAIM_MS = 160
const MOVE_CANCEL_PX = 14
const DRAG_MIME = 'application/x-privfina-list-drag'
const GHOST_CLASS = 'list-drag-ghost'
const GHOST_LAYER_CLASS = 'list-drag-layer'

let activeDrag = null
let longPressTimer = null
let scrollClaimTimer = null
let longPressOrigin = null
let gestureClaimed = false
let suppressClickUntil = 0
let documentListenersBound = false
let scrollLock = null

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  if (scrollClaimTimer) {
    clearTimeout(scrollClaimTimer)
    scrollClaimTimer = null
  }
  longPressOrigin = null
  gestureClaimed = false
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
  document.querySelectorAll(`.${GHOST_LAYER_CLASS}, .${GHOST_CLASS}`).forEach((node) => {
    node.remove()
  })
}

function lockDocumentScroll() {
  if (scrollLock || typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  scrollLock = {
    scrollX: window.scrollX || window.pageXOffset || 0,
    scrollY: window.scrollY || window.pageYOffset || 0
  }

  const { scrollX, scrollY } = scrollLock
  document.documentElement.classList.add('is-list-scroll-locked')
  document.body.classList.add('is-list-scroll-locked')
  document.body.style.top = `-${scrollY}px`
  document.body.style.left = `-${scrollX}px`
}

function unlockDocumentScroll() {
  if (!scrollLock || typeof window === 'undefined' || typeof document === 'undefined') {
    scrollLock = null
    return
  }

  const { scrollX, scrollY } = scrollLock
  scrollLock = null
  document.documentElement.classList.remove('is-list-scroll-locked')
  document.body.classList.remove('is-list-scroll-locked')
  document.body.style.top = ''
  document.body.style.left = ''
  window.scrollTo(scrollX, scrollY)
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
  unlockDocumentScroll()

  if (drag?.source) {
    drag.source.classList.remove('is-dragging')
    drag.source.classList.remove('is-drag-source')
    releasePointerCapture(drag)
    // Mouse-only HTML5 affordance: never leave touch targets draggable.
    if (drag.mode === 'html5') {
      drag.source.setAttribute('draggable', 'false')
    }
  }

  // Also clear is-dragging from any stale nodes after a mid-drag re-render.
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.is-dragging, .is-drag-source').forEach((node) => {
      node.classList.remove('is-dragging')
      node.classList.remove('is-drag-source')
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

/**
 * Keep the floating ghost inside the visual viewport so it cannot widen the page.
 */
function clampGhostOrigin(clientX, clientY, width, height, offsetX = 24, offsetY = 16) {
  const viewportWidth =
    Number(globalThis.innerWidth) ||
    Number(globalThis.document?.documentElement?.clientWidth) ||
    Number(width) ||
    0
  const viewportHeight =
    Number(globalThis.innerHeight) ||
    Number(globalThis.document?.documentElement?.clientHeight) ||
    Number(height) ||
    0

  const safeWidth = Math.max(0, Number(width) || 0)
  const safeHeight = Math.max(0, Number(height) || 0)
  const maxX = Math.max(4, viewportWidth - safeWidth - 4)
  const maxY = Math.max(4, viewportHeight - safeHeight - 4)
  const rawX = clientX - offsetX
  const rawY = clientY - offsetY

  return {
    x: Math.min(Math.max(4, rawX), maxX),
    y: Math.min(Math.max(4, rawY), maxY)
  }
}

function ensureGhostLayer() {
  let layer = document.querySelector(`.${GHOST_LAYER_CLASS}`)
  if (layer) {
    return layer
  }
  layer = document.createElement('div')
  layer.className = GHOST_LAYER_CLASS
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)
  return layer
}

function createGhost(source, clientX, clientY) {
  removeAllGhosts()

  const rect = source.getBoundingClientRect()
  const width = Math.min(rect.width || 280, Math.min(320, (window.innerWidth || 320) - 16))
  const layer = ensureGhostLayer()
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
    clone.classList.remove('is-dragging', 'is-drag-source')
    clone.removeAttribute('id')
    clone.removeAttribute('draggable')
    clone.querySelectorAll?.('[id]')?.forEach((node) => node.removeAttribute('id'))
    // Strip controls from the ghost — they are visual noise and can confuse hit-testing.
    clone.querySelectorAll?.('button, input, a, .flow-card-actions, .action-col')?.forEach((node) => {
      node.remove()
    })
    ghost.appendChild(clone)
  }

  ghost.style.width = `${width}px`
  ghost.style.margin = '0'
  ghost.style.pointerEvents = 'none'
  layer.appendChild(ghost)

  // Measure after mount so clamping uses the real ghost height.
  const ghostHeight = ghost.getBoundingClientRect().height || 48
  positionGhost(ghost, clientX, clientY, width, ghostHeight)
  ghost.dataset.ghostWidth = String(width)
  ghost.dataset.ghostHeight = String(ghostHeight)
  return ghost
}

function positionGhost(ghost, clientX, clientY, width, height) {
  if (!ghost) {
    return
  }
  const resolvedWidth = width ?? Number(ghost.dataset.ghostWidth) ?? ghost.offsetWidth ?? 280
  const resolvedHeight = height ?? Number(ghost.dataset.ghostHeight) ?? ghost.offsetHeight ?? 48
  const offsetX = Math.min(24, resolvedWidth / 3)
  const { x, y } = clampGhostOrigin(clientX, clientY, resolvedWidth, resolvedHeight, offsetX, 16)
  // Transform-only positioning inside an overflow-clipped layer avoids widening the document
  // and reduces iOS Safari paint artifacts from left/top + scale combinations.
  ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

function elementFromPointIgnoringDragChrome(clientX, clientY, drag) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || typeof document === 'undefined') {
    return null
  }

  // Prefer elementsFromPoint so we never toggle visibility (iOS flicker / ghosting).
  const stack =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean)

  for (const node of stack) {
    if (!node || node === drag?.ghost || node === drag?.source) {
      continue
    }
    if (node.closest?.(`.${GHOST_CLASS}, .${GHOST_LAYER_CLASS}`)) {
      continue
    }
    if (drag?.source && drag.source.contains?.(node)) {
      continue
    }
    return node
  }

  return null
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

function shouldPreventTouchScroll(event) {
  if (activeDrag?.mode === 'touch') {
    return activeDrag.pointerId == null || event.pointerId == null || activeDrag.pointerId === event.pointerId
  }
  if (!longPressOrigin) {
    return false
  }
  if (longPressOrigin.pointerId != null && event.pointerId != null && longPressOrigin.pointerId !== event.pointerId) {
    return false
  }
  return gestureClaimed
}

function onDocumentPointerMove(event) {
  if (longPressOrigin && longPressOrigin.pointerId === event.pointerId) {
    const dx = event.clientX - longPressOrigin.x
    const dy = event.clientY - longPressOrigin.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      // Finger moved before the stillness claim — release so the list can scroll.
      if (!gestureClaimed) {
        clearLongPress()
      }
    }
  }

  if (!activeDrag || activeDrag.mode !== 'touch' || activeDrag.pointerId !== event.pointerId) {
    return
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault()
  }
  activeDrag.lastX = event.clientX
  activeDrag.lastY = event.clientY
  positionGhost(activeDrag.ghost, event.clientX, event.clientY)

  clearDropHighlights(activeDrag.root)
  const under = elementFromPointIgnoringDragChrome(event.clientX, event.clientY, activeDrag)
  setDropHighlight(under)
}

function onDocumentTouchMove(event) {
  // Android Chrome often ignores preventDefault on pointermove for scroll suppression;
  // a non-passive touchmove listener is required to keep mid-drag scrolling off.
  if (!shouldPreventTouchScroll(event)) {
    return
  }
  if (typeof event.preventDefault === 'function') {
    event.preventDefault()
  }

  if (!activeDrag || activeDrag.mode !== 'touch') {
    return
  }

  const touch = event.changedTouches?.[0] || event.touches?.[0]
  if (!touch) {
    return
  }
  activeDrag.lastX = touch.clientX
  activeDrag.lastY = touch.clientY
  positionGhost(activeDrag.ghost, touch.clientX, touch.clientY)
  clearDropHighlights(activeDrag.root)
  const under = elementFromPointIgnoringDragChrome(touch.clientX, touch.clientY, activeDrag)
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
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false })
  document.addEventListener('pointerup', onDocumentPointerUp)
  document.addEventListener('pointercancel', onDocumentPointerCancel)
  document.addEventListener('keydown', onDocumentKeyDown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('dragend', onDocumentDragEnd, true)
  window.addEventListener('blur', onVisibilityChange)
}

function beginTouchDrag(origin) {
  clearLongPress()
  suppressClickUntil = Date.now() + 500
  endActiveDrag(origin.root)

  lockDocumentScroll()
  const ghost = createGhost(origin.element, origin.x, origin.y)
  origin.element.classList.add('is-dragging')
  origin.element.classList.add('is-drag-source')
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

  // Never leave touch targets HTML5-draggable; enable only for a mouse press.
  element.setAttribute('draggable', 'false')
  element.dataset.dragKind = payload.kind
  element.dataset.dragId = payload.id

  ensureDocumentListeners()

  element.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return
    }
    if (isInteractiveDragExclusion(event.target)) {
      return
    }
    element.setAttribute('draggable', 'true')
  })

  element.addEventListener('mouseup', () => {
    if (!activeDrag || activeDrag.source !== element) {
      element.setAttribute('draggable', 'false')
    }
  })

  element.addEventListener('dragstart', (event) => {
    if (isInteractiveDragExclusion(event.target)) {
      event.preventDefault()
      element.setAttribute('draggable', 'false')
      return
    }

    // Touch long-press owns the gesture; ignore HTML5 drag from the same press.
    if (activeDrag?.mode === 'touch' || (event.pointerType && event.pointerType !== 'mouse')) {
      event.preventDefault()
      element.setAttribute('draggable', 'false')
      return
    }

    const serialized = JSON.stringify(payload)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_MIME, serialized)
    event.dataTransfer.setData('text/plain', serialized)

    endActiveDrag(root)
    suppressClickUntil = Date.now() + 500

    element.classList.add('is-dragging')
    element.classList.add('is-drag-source')
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
    element.setAttribute('draggable', 'false')
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

    // After a short stillness window, claim the gesture so Android does not start
    // a scroll that would pointercancel the eventual long-press drag.
    scrollClaimTimer = setTimeout(() => {
      if (!longPressOrigin || longPressOrigin.element !== element) {
        return
      }
      gestureClaimed = true
    }, SCROLL_CLAIM_MS)

    longPressTimer = setTimeout(() => {
      if (!longPressOrigin || longPressOrigin.element !== element) {
        return
      }
      gestureClaimed = true
      beginTouchDrag(longPressOrigin)
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
  clampGhostOrigin,
  parseDragPayload,
  readDropTarget,
  LONG_PRESS_MS,
  MOVE_CANCEL_PX,
  SCROLL_CLAIM_MS
}
