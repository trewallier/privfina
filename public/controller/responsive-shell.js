const NARROW_MEDIA_QUERY = '(max-width: 1020px)'

/**
 * Adaptive workspace shell: wide desktop keeps both panes; narrow uses
 * browse / compose / chart views (ADR 0019).
 */
function createResponsiveShell({
  root,
  mobileNav,
  onViewportChange,
  onViewChange
} = {}) {
  const matchMediaFn =
    typeof globalThis !== 'undefined' && typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia.bind(globalThis)
      : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia.bind(window)
        : null
  const media = matchMediaFn ? matchMediaFn(NARROW_MEDIA_QUERY) : null

  let viewport = media?.matches ? 'narrow' : 'wide'
  let view = 'browse'
  let composeType = null
  let pickingType = false

  function applyDom() {
    if (!root) {
      return
    }

    root.dataset.viewport = viewport
    root.dataset.shellView = view
    root.dataset.pickingType = pickingType ? 'true' : 'false'

    if (composeType) {
      root.dataset.composeType = composeType
    } else {
      delete root.dataset.composeType
    }

    if (mobileNav) {
      mobileNav.hidden = viewport !== 'narrow'
      mobileNav.querySelectorAll('[data-shell-target]').forEach((button) => {
        const target = button.getAttribute('data-shell-target')
        const isActive =
          target === view || (target === 'add' && (view === 'compose' || pickingType))
        button.classList.toggle('is-active', isActive)
        button.setAttribute('aria-current', isActive ? 'page' : 'false')
      })
    }
  }

  function setViewport(next) {
    if (next !== 'wide' && next !== 'narrow') {
      return
    }

    if (viewport === next) {
      applyDom()
      return
    }

    viewport = next
    if (viewport === 'wide') {
      view = 'browse'
      pickingType = false
      composeType = null
    }

    applyDom()
    onViewportChange?.(viewport)
  }

  function setView(next) {
    if (next !== 'browse' && next !== 'compose' && next !== 'chart') {
      return
    }

    view = next
    if (view !== 'compose') {
      pickingType = false
      composeType = null
    }

    applyDom()
    onViewChange?.(view, { composeType, pickingType, viewport })
  }

  function enterTypePicker() {
    view = 'compose'
    pickingType = true
    composeType = null
    applyDom()
    onViewChange?.(view, { composeType, pickingType, viewport })
  }

  function enterCompose(type) {
    view = 'compose'
    pickingType = false
    composeType = type || null
    applyDom()
    onViewChange?.(view, { composeType, pickingType, viewport })
  }

  function exitCompose() {
    view = 'browse'
    pickingType = false
    composeType = null
    applyDom()
    onViewChange?.(view, { composeType, pickingType, viewport })
  }

  function isNarrow() {
    return viewport === 'narrow'
  }

  function getState() {
    return { viewport, view, composeType, pickingType }
  }

  function bindMedia() {
    if (!media) {
      applyDom()
      return () => {}
    }

    const onChange = (event) => {
      setViewport(event.matches ? 'narrow' : 'wide')
    }

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      applyDom()
      return () => media.removeEventListener('change', onChange)
    }

    media.addListener(onChange)
    applyDom()
    return () => media.removeListener(onChange)
  }

  function bindMobileNav() {
    if (!mobileNav) {
      return
    }

    mobileNav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-shell-target]')
      if (!button || !mobileNav.contains(button)) {
        return
      }

      const target = button.getAttribute('data-shell-target')
      if (target === 'browse') {
        exitCompose()
        setView('browse')
        return
      }

      if (target === 'chart') {
        setView('chart')
        return
      }

      if (target === 'add') {
        enterTypePicker()
      }
    })
  }

  applyDom()

  return {
    NARROW_MEDIA_QUERY,
    bindMedia,
    bindMobileNav,
    setViewport,
    setView,
    enterTypePicker,
    enterCompose,
    exitCompose,
    isNarrow,
    getState,
    applyDom
  }
}

function createToastController(toastElement) {
  let hideTimer = null

  function hide() {
    if (!toastElement) {
      return
    }

    toastElement.hidden = true
    toastElement.textContent = ''
    toastElement.removeAttribute('data-level')
  }

  function show(message, level = 'success', durationMs = 2400) {
    if (!toastElement || !message) {
      return
    }

    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    toastElement.textContent = message
    toastElement.dataset.level = level
    toastElement.hidden = false

    hideTimer = setTimeout(() => {
      hide()
      hideTimer = null
    }, durationMs)
  }

  return { show, hide }
}

export { NARROW_MEDIA_QUERY, createResponsiveShell, createToastController }
