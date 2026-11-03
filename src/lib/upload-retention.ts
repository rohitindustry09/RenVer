/** Which saved project sources can be deleted to stop the disk filling up. Pure, so the rules are easy to test. */

export interface RetentionInput {
  /** Every source folder on disk and how old it is. */
  onDisk: { id: string; ageMs: number }[];
  /** All deploys, newest first. `uploadId` is null for a deploy with no saved source. */
  deploys: { projectId: string; uploadId: string | null }[];
  /** How many of a project's newest deploys keep their source, so a rollback to them still works. */
  keepPerProject: number;
  /** A source that no deploy uses is kept this long (someone may still be about to deploy it). */
  orphanMaxAgeMs: number;
}

export function selectUploadsToDelete({ onDisk, deploys, keepPerProject, orphanMaxAgeMs }: RetentionInput): string[] {
  const keep = new Set<string>();
  const seen = new Map<string, number>();
  for (const deploy of deploys) {
    const count = seen.get(deploy.projectId) ?? 0;
    seen.set(deploy.projectId, count + 1);
    if (deploy.uploadId && count < keepPerProject) keep.add(deploy.uploadId);
  }

  const usedByAnyDeploy = new Set(deploys.flatMap((d) => (d.uploadId ? [d.uploadId] : [])));
  return onDisk
    .filter(({ id, ageMs }) => {
      if (keep.has(id)) return false;
      // Used only by deploys older than the ones we keep: safe to delete. Used by nothing: delete once it is clearly abandoned.
      return usedByAnyDeploy.has(id) || ageMs > orphanMaxAgeMs;
    })
    .map(({ id }) => id);
}
