const CONTAINER_NAME_PATTERN = /^renver-(.+)-([0-9a-f]{8})$/;

/** Maps `renver-<sub>-<deployId>` back to its image tag `renver/<sub>:<deployId>`. */
export function imageTagFor(container: string): string | null {
  const match = CONTAINER_NAME_PATTERN.exec(container);
  return match ? `renver/${match[1]}:${match[2]}` : null;
}
