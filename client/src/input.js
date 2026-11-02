export function createInput() {
  const keys = new Set()
  const pressedKeys = new Set()

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) {
      pressedKeys.add(event.code)
    }

    keys.add(event.code)
  })

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code)
  })

  return {
    isDown(code) {
      return keys.has(code)
    },

    justPressed(code) {
      if (pressedKeys.has(code)) {
        pressedKeys.delete(code)
        return true
      }

      return false
    },
  }
}
