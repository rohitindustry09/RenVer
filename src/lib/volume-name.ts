import { createHash } from "node:crypto";

/** The Docker volume that holds one folder of one project. Stable, so a redeploy finds its files again. Server only. */
export function volumeName(projectId: string, containerPath: string): string {
  const tag = createHash("sha256").update(containerPath).digest("hex").slice(0, 8);
  return `renver-vol-${projectId}-${tag}`;
}
