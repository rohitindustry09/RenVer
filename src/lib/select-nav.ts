interface Navigable {
  isDisabled?: boolean;
}

/**
 * The next enabled option when the arrow keys are pressed. `active` is -1 while nothing is highlighted yet.
 * It stops at either end rather than wrapping, and returns -1 when no option can be chosen at all.
 */
export function moveSelection(options: readonly Navigable[], active: number, direction: 1 | -1): number {
  const isEnabled = (i: number) => options[i] !== undefined && !options[i].isDisabled;
  const start = active === -1 ? (direction === 1 ? -1 : options.length) : active;
  for (let i = start + direction; i >= 0 && i < options.length; i += direction) {
    if (isEnabled(i)) return i;
  }
  return isEnabled(active) ? active : options.findIndex((_, i) => isEnabled(i));
}
