/**
 * Mouse HTML5 DnD + touch long-press drag for configured-list items/folders.
 */

const LONG_PRESS_MS = 400
const MOVE_CANCEL_PX = 10
const DRAG_MIME = 'application/x-privfina-list-drag'

let activeDrag = null
let longPressTimer = null
let longPressOrigin = null
let suppressClickUntil = 0

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressOrigin = null
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
  if (type === 'folder') {
    return {
      type: 'folder',
      folderId: node.dataset.folderId,
      index: Number.isInteger(Number(node.dataset.dropIndex))
        ? Number(node.dataset.dropIndex)
        : undefined
    }
  }

  if (type === 'root') {
    return {
      type: 'root',
      index: Number.isInteger(Number(node.dataset.dropIndex))
        ? Number(node.dataset.dropIndex)
        : undefined
    }
  }

  if (type === 'folder-item') {
    return {
      type: 'folder',
      folderId: node.dataset.folderId,
      index: Number.isInteger(Number(node.dataset.dropIndex))
        ? Number(node.dataset.dropIndex)
        : undefined
    }
  }

  return null
}

function clearDropHighlights(root) {
  root?.querySelectorAll?.('.is-drop-target')?.forEach((node) => {
    node.classList.remove('is-drop-target')
  })
}

function setDropHighlight(element) {
  const target = element?.closest?.('[data-drop-target]')
  if (!target) {
    return
  }
  target.classList.add('is-drop-target')
}

function endActiveDrag(root) {
  if (activeDrag?.ghost?.parentNode) {
    activeDrag.ghost.parentNode.removeChild(activeDrag.ghost)
  }
  if (activeDrag?.source) {
    activeDrag.source.classList.remove('is-dragging')
  }
  clearDropHighlights(root)
  activeDrag = null
  document.body.classList.remove('is-list-dragging')
}

function createGhost(source, clientX, clientY) {
  const ghost = source.cloneNode(true)
  ghost.classList.add('list-drag-ghost')
  ghost.style.position = 'fixed'
  ghost.style.left = `${clientX - 24}px`
  ghost.style.top = `${clientY - 16}px`
  ghost.style.width = `${Math.min(source.getBoundingClientRect().width, 320)}px`
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '10000'
  document.body.appendChild(ghost)
  return ghost
}

function bindDraggable(element, payload, onDrop, root) {
  if (!element || !payload) {
    return
  }

  element.setAttribute('draggable', 'true')
  element.dataset.dragKind = payload.kind
  element.dataset.dragId = payload.id

  element.addEventListener('dragstart', (event) => {
    if (event.target.closest('button, input, a, label')) {
      event.preventDefault()
      return
    }

    const serialized = JSON.stringify(payload)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_MIME, serialized)
    event.dataTransfer.setData('text/plain', serialized)
    element.classList.add('is-dragging')
    document.body.classList.add('is-list-dragging')
    activeDrag = { payload, source: element, ghost: null, mode: 'html5' }
  })

  element.addEventListener('dragend', () => {
    endActiveDrag(root)
  })

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || event.button !== 0) {
      return
    }
    if (event.target.closest('button, input, a, label')) {
      return
    }

    clearLongPress()
    longPressOrigin = { x: event.clientX, y: event.clientY, element, payload, pointerId: event.pointerId }

    longPressTimer = setTimeout(() => {
      if (!longPressOrigin) {
        return
      }

      const origin = longPressOrigin
      clearLongPress()
      suppressClickUntil = Date.now() + 500
      endActiveDrag(root)

      const ghost = createGhost(origin.element, origin.x, origin.y)
      origin.element.classList.add('is-dragging')
      document.body.classList.add('is-list-dragging')
      activeDrag = {
        payload: origin.payload,
        source: origin.element,
        ghost,
        mode: 'touch',
        pointerId: origin.pointerId
      }

      try {
        origin.element.setPointerCapture(origin.pointerId)
      } catch {
        // Ignore capture failures on unsupported targets.
      }
    }, LONG_PRESS_MS)
  })

  element.addEventListener('pointermove', (event) => {
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
    if (activeDrag.ghost) {
      activeDrag.ghost.style.left = `${event.clientX - 24}px`
      activeDrag.ghost.style.top = `${event.clientY - 16}px`
    }

    clearDropHighlights(root)
    const under = document.elementFromPoint(event.clientX, event.clientY)
    setDropHighlight(under)
  })

  element.addEventListener('pointerup', (event) => {
    clearLongPress()

    if (!activeDrag || activeDrag.mode !== 'touch' || activeDrag.pointerId !== event.pointerId) {
      return
    }

    const under = document.elementFromPoint(event.clientX, event.clientY)
    const target = readDropTarget(under)
    const payload = activeDrag.payload
    endActiveDrag(root)

    if (target && typeof onDrop === 'function') {
      onDrop(payload, target)
    }
  })

  element.addEventListener('pointercancel', () => {
    clearLongPress()
    if (activeDrag?.mode === 'touch') {
      endActiveDrag(root)
    }
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
      return
    }
    event.preventDefault()
    const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain')
    const payload = parseDragPayload(raw) || activeDrag?.payload
    clearDropHighlights(root)
    const handler = root.__privfinaListDrop
    if (payload && typeof handler === 'function') {
      handler(payload, target)
    }
  })
}

export {
  bindDraggable,
  bindDropSurface,
  LONG_PRESS_MS
}
