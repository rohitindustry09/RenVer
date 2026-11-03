import { publicProject, type ProjectListItem } from "./api";
import { latestUploadId, listDeploys, listProjects } from "./db";
import { readUploadSource } from "./uploads";

/** Projects with their source and latest deploy attached, for the Overview cards. */
export function listProjectItems(): ProjectListItem[] {
  return listProjects().map((project) => {
    const [latest] = listDeploys(project.id);
    const uploadId = latestUploadId(project.id);
    return {
      ...publicProject(project),
      source: uploadId ? readUploadSource(uploadId) : null,
      lastDeploy: latest
        ? { id: latest.id, status: latest.status, createdAt: latest.createdAt, finishedAt: latest.finishedAt }
        : null,
    };
  });
}
