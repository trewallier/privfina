function closeAllBoxes(boxes) {
  Object.values(boxes).forEach((box) => {
    if (box) {
      box.open = false
    }
  })
}

function createComposerManager({ flowComposer, toggleComposerButton, boxes, openButtons = {} }) {
  const boxKeys = Object.keys(boxes)

  function setComposerVisibility(isVisible) {
    if (!flowComposer || !toggleComposerButton) {
      return
    }

    flowComposer.hidden = !isVisible
    toggleComposerButton.setAttribute('aria-expanded', String(isVisible))
    toggleComposerButton.textContent = isVisible ? 'Hide Add Flow Boxes' : 'Show Add Flow Boxes'
  }

  function collapseComposerBoxes() {
    closeAllBoxes(boxes)
  }

  function openComposerBox(type) {
    setComposerVisibility(true)
    closeAllBoxes(boxes)

    const box = boxes[type]
    if (box) {
      box.open = true
    }
  }

  function bindBoxToggleEvents() {
    boxKeys.forEach((key) => {
      const box = boxes[key]
      if (!box) {
        return
      }

      box.addEventListener('toggle', () => {
        if (!box.open) {
          return
        }

        boxKeys.forEach((otherKey) => {
          if (otherKey === key) {
            return
          }

          const other = boxes[otherKey]
          if (other) {
            other.open = false
          }
        })
      })
    })
  }

  function bindOpenButtons() {
    Object.entries(openButtons).forEach(([type, button]) => {
      if (!button) {
        return
      }

      button.addEventListener('click', () => {
        openComposerBox(type)
      })
    })
  }

  function bindToolbarToggle() {
    if (!toggleComposerButton) {
      return
    }

    toggleComposerButton.addEventListener('click', () => {
      const shouldShow = !flowComposer || flowComposer.hidden
      setComposerVisibility(shouldShow)
      if (!shouldShow) {
        collapseComposerBoxes()
      }
    })
  }

  function bindEvents() {
    bindBoxToggleEvents()
    bindOpenButtons()
    bindToolbarToggle()
  }

  return {
    setComposerVisibility,
    collapseComposerBoxes,
    openComposerBox,
    bindEvents
  }
}

export { createComposerManager }
