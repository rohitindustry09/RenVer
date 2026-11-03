"use client";

import type { ProjectListItem } from "@/lib/api";
import { useFetch } from "./useFetch";

const REFRESH_MS = 5000;

export function useProjects() {
  const { data, error, reload, isLoading } = useFetch<ProjectListItem[]>("/api/projects", REFRESH_MS);
  return { projects: data, error, reload, isLoading };
}
