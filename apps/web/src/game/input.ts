import { createIdleInput, type MovementInput } from "@ig-campus/contracts";

const pressedKeys = new Set<string>();

export function bindMovementKeys(onChange: (input: MovementInput) => void): () => void {
  let sequence = 0;
  let lastInput = createIdleInput(sequence);

  const emit = () => {
    const nextInput: MovementInput = {
      up: pressedKeys.has("arrowup") || pressedKeys.has("w"),
      down: pressedKeys.has("arrowdown") || pressedKeys.has("s"),
      left: pressedKeys.has("arrowleft") || pressedKeys.has("a"),
      right: pressedKeys.has("arrowright") || pressedKeys.has("d"),
      sequence,
    };

    if (!sameInput(lastInput, nextInput)) {
      sequence += 1;
      nextInput.sequence = sequence;
      lastInput = nextInput;
      onChange(nextInput);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();

    if (!isMovementKey(key)) {
      return;
    }

    event.preventDefault();
    pressedKeys.add(key);
    emit();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();

    if (!isMovementKey(key)) {
      return;
    }

    event.preventDefault();
    pressedKeys.delete(key);
    emit();
  };

  const onBlur = () => {
    pressedKeys.clear();
    emit();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return () => {
    pressedKeys.clear();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}

function isMovementKey(key: string): boolean {
  return ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key);
}

function sameInput(a: MovementInput, b: MovementInput): boolean {
  return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right;
}
