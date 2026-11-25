export interface InputController {
  isDown(code: string): boolean;
  justPressed(code: string): boolean;
}

export function createInput(): InputController {
  const keys = new Set<string>();
  const pressedKeys = new Set<string>();

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) {
      pressedKeys.add(event.code);
    }

    keys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });

  return {
    isDown(code: string): boolean {
      return keys.has(code);
    },

    justPressed(code: string): boolean {
      if (pressedKeys.has(code)) {
        pressedKeys.delete(code);
        return true;
      }

      return false;
    },
  };
}
