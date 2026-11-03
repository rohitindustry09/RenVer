import { NextResponse } from "next/server";
import type { DatabaseRecord, Project } from "./db";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/** Like fail, but uses the HTTP status carried by errors such as DomainError and DatabaseError. */
export function failFrom(error: unknown, fallbackStatus = 400): NextResponse<ApiResponse<never>> {
  const carried = error instanceof Error ? (error as { status?: unknown }).status : undefined;
  return fail(error, typeof carried === "number" ? carried : fallbackStatus);
}

export function fail(error: unknown, status = 400): NextResponse<ApiResponse<never>> {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ success: false, error: message }, { status });
}

export type PublicDatabase = Omit<DatabaseRecord, "secretEncrypted">;

/** A database as the Databases page shows it: the record plus the projects it is connected to. */
export interface DatabaseListItem extends PublicDatabase {
  links: { projectId: string; projectName: string; variable: string }[];
}

/** Strips the encrypted credentials before a database record is sent to the browser. */
export function publicDatabase(record: DatabaseRecord): PublicDatabase {
  const { secretEncrypted, ...rest } = record;
  return rest;
}

/** A project as the Overview shows it: the project plus where it came from and how its last deploy went. */
export interface ProjectListItem extends PublicProject {
  source: { source: "zip" | "github"; label: string; branch: string | null } | null;
  lastDeploy: { id: string; status: string; createdAt: string; finishedAt: string | null } | null;
}

export type PublicProject = Omit<Project, "envEncrypted"> & { hasEnv: boolean };

/** Strips secrets before a project is sent to the browser. */
export function publicProject(project: Project): PublicProject {
  const { envEncrypted, ...rest } = project;
  return { ...rest, hasEnv: envEncrypted !== null };
}
