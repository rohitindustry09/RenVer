import type { PublicProject } from "@/lib/api";
import type { Deploy } from "@/lib/db";

export interface ProjectDetail {
  project: PublicProject;
  deploys: Deploy[];
  /** Every hostname that reaches the project, including the primary one. */
  hosts: string[];
  /** Open it by the server's IP and port, when apps are published that way. */
  directUrl?: string | null;
  /** The GitHub repository this project was imported from, if any. */
  github?: { repo: string; branch: string | null } | null;
}

export type ProjectTab = "overview" | "deployments" | "runtime" | "settings";

export const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deployments", label: "Deployments" },
  { id: "runtime", label: "Runtime" },
  { id: "settings", label: "Settings" },
];
