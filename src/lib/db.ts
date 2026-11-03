import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "./config";

/** "paused" is on purpose (the owner stopped it); "stopped" means it went down and could not be brought back. */
export type ProjectStatus = "created" | "deploying" | "running" | "failed" | "stopped" | "paused";
export type DeployStatus = "queued" | "building" | "starting" | "live" | "failed";

export interface ProjectConfig {
  framework: string;
  /** What it is built with, for its logo. Missing on projects saved before stacks existed. */
  stack?: string;
  /** This project's own memory and CPU limits; anything missing follows the global limits. */
  limits?: { memory?: string; cpus?: string };
  kind: "server" | "static";
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  outputDir: string | null;
  port: number;
  nodeVersion: string;
  packageManager: string;
}

export interface Project {
  id: string;
  name: string;
  /** A unique, DNS-safe name for the project. Used for container and image names, not for routing. */
  subdomain: string;
  /** The hostname the project is mainly reached at, for example shop.example.com or example.com. */
  primaryHost: string;
  config: ProjectConfig;
  envEncrypted: string | null;
  status: ProjectStatus;
  container: string | null;
  hostPort: number | null;
  createdAt: string;
}

export interface Deploy {
  id: string;
  projectId: string;
  uploadId: string | null;
  status: DeployStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL,
  env_encrypted TEXT,
  status TEXT NOT NULL,
  container TEXT,
  host_port INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS databases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  engine TEXT NOT NULL,
  version TEXT NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  container TEXT NOT NULL,
  volume TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deploys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  status TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_hosts (
  host TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const globalDb = globalThis as typeof globalThis & { __renverDb?: DatabaseSync };

/** Adds a column to a table created by an earlier version of the app. */
function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Recovers state left behind by a crash or restart mid-deploy. */
function recoverInterruptedWork(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE deploys SET status = 'failed', error = 'Interrupted by a restart', finished_at = ? WHERE status IN ('queued','building','starting')",
  ).run(now);
  db.prepare(
    "UPDATE projects SET status = CASE WHEN container IS NULL THEN 'failed' ELSE 'running' END WHERE status = 'deploying'",
  ).run();
  db.prepare("UPDATE databases SET status = 'failed', error = 'Interrupted by a restart' WHERE status = 'creating'").run();
}

/** Idempotent. Runs once per loaded copy of this module, so hot reload in dev picks up schema changes too. */
let migratedByThisModule = false;

const SEEDED_DOMAIN_KEY = "seeded_domain";

/** Makes sure a domain record exists for the base domain from the environment (verified: the admin configured it). */
function ensureEnvDomain(db: DatabaseSync, create: boolean): string | null {
  const existing = db.prepare("SELECT id FROM domains WHERE name = ?").get(config.baseDomain) as Row | undefined;
  if (existing) return String(existing.id);
  if (!create) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO domains (id, name, token, status, verified_at, created_at) VALUES (?,?,?,?,?,?)").run(
    id,
    config.baseDomain,
    randomUUID().replace(/-/g, ""),
    "verified",
    now,
    now,
  );
  return id;
}

/** The environment's base domain becomes a normal, removable domain the first time it is seen. */
function seedEnvDomain(db: DatabaseSync): void {
  const seeded = db.prepare("SELECT value FROM settings WHERE key = ?").get(SEEDED_DOMAIN_KEY) as Row | undefined;
  if (seeded?.value === config.baseDomain) return;
  ensureEnvDomain(db, true);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(SEEDED_DOMAIN_KEY, config.baseDomain);
}

/** Projects created before domains existed get their old subdomain.basedomain address as a host. */
function backfillHosts(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id, subdomain FROM projects WHERE primary_host IS NULL").all() as Row[];
  if (rows.length === 0) return;
  const domainId = ensureEnvDomain(db, true)!;
  const now = new Date().toISOString();
  for (const row of rows) {
    const projectId = String(row.id);
    const host = `${String(row.subdomain)}.${config.baseDomain}`;
    db.prepare("UPDATE projects SET primary_host = ? WHERE id = ?").run(host, projectId);
    db.prepare("INSERT OR IGNORE INTO project_hosts (host, project_id, domain_id, created_at) VALUES (?,?,?,?)").run(
      host,
      projectId,
      domainId,
      now,
    );
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA);
  ensureColumn(db, "deploys", "upload_id", "TEXT");
  ensureColumn(db, "projects", "primary_host", "TEXT");
  seedEnvDomain(db);
  backfillHosts(db);
  migratedByThisModule = true;
}

/** Closes the connection so the database file can be replaced. The next call reopens it, migrations included. */
export function closeDatabase(): void {
  globalDb.__renverDb?.close();
  globalDb.__renverDb = undefined;
  migratedByThisModule = false;
}

function open(): DatabaseSync {
  if (globalDb.__renverDb) {
    if (!migratedByThisModule) migrate(globalDb.__renverDb);
    return globalDb.__renverDb;
  }
  const sqlite = process.getBuiltinModule("node:sqlite");
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new sqlite.DatabaseSync(path.join(config.dataDir, "renver.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  recoverInterruptedWork(db);
  globalDb.__renverDb = db;
  return db;
}

const toProject = (r: Row): Project => ({
  id: String(r.id),
  name: String(r.name),
  subdomain: String(r.subdomain),
  primaryHost: String(r.primary_host ?? ""),
  config: JSON.parse(String(r.config)) as ProjectConfig,
  envEncrypted: (r.env_encrypted as string | null) ?? null,
  status: r.status as ProjectStatus,
  container: (r.container as string | null) ?? null,
  hostPort: (r.host_port as number | null) ?? null,
  createdAt: String(r.created_at),
});

const toDeploy = (r: Row): Deploy => ({
  id: String(r.id),
  projectId: String(r.project_id),
  uploadId: (r.upload_id as string | null) ?? null,
  status: r.status as DeployStatus,
  error: (r.error as string | null) ?? null,
  createdAt: String(r.created_at),
  finishedAt: (r.finished_at as string | null) ?? null,
});

/** Creates the project and its first hostname together, so a project never exists without an address. */
export function createProject(input: {
  name: string;
  subdomain: string;
  primaryHost: string;
  domainId: string;
  config: ProjectConfig;
  envEncrypted: string | null;
}): Project {
  const db = open();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO projects (id, name, subdomain, primary_host, config, env_encrypted, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(id, input.name, input.subdomain, input.primaryHost, JSON.stringify(input.config), input.envEncrypted, "created", now);
    db.prepare("INSERT INTO project_hosts (host, project_id, domain_id, created_at) VALUES (?,?,?,?)").run(
      input.primaryHost,
      id,
      input.domainId,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const row = open().prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? toProject(row as Row) : null;
}

export function getProjectBySubdomain(subdomain: string): Project | null {
  const row = open().prepare("SELECT * FROM projects WHERE subdomain = ?").get(subdomain);
  return row ? toProject(row as Row) : null;
}

export function listProjects(): Project[] {
  return open().prepare("SELECT * FROM projects ORDER BY created_at DESC").all().map((r) => toProject(r as Row));
}

export function updateProject(
  id: string,
  patch: { status?: ProjectStatus; container?: string | null; hostPort?: number | null },
): void {
  const current = getProject(id);
  if (!current) return;
  open()
    .prepare("UPDATE projects SET status = ?, container = ?, host_port = ? WHERE id = ?")
    .run(
      patch.status ?? current.status,
      patch.container === undefined ? current.container : patch.container,
      patch.hostPort === undefined ? current.hostPort : patch.hostPort,
      id,
    );
}

/** Saves a project's own memory/CPU limits. Missing fields mean "use the global limit". */
export function updateProjectLimits(id: string, limits: { memory?: string; cpus?: string }): void {
  const current = getProject(id);
  if (!current) return;
  const next: ProjectConfig = { ...current.config, limits };
  open().prepare("UPDATE projects SET config = ? WHERE id = ?").run(JSON.stringify(next), id);
}

export function usedHostPorts(): number[] {
  return open()
    .prepare("SELECT host_port FROM projects WHERE host_port IS NOT NULL")
    .all()
    .map((r) => (r as Row).host_port as number);
}

export function createDeploy(projectId: string, uploadId: string | null = null): Deploy {
  const id = randomUUID().slice(0, 8);
  open()
    .prepare("INSERT INTO deploys (id, project_id, upload_id, status, created_at) VALUES (?,?,?,?,?)")
    .run(id, projectId, uploadId, "queued", new Date().toISOString());
  return getDeploy(id)!;
}

export interface DeployWithProject extends Deploy {
  projectName: string;
  primaryHost: string;
}

/** Newest deploys across every project, for the Deployments page. */
export function listAllDeploys(limit = 50): DeployWithProject[] {
  return open()
    .prepare(
      "SELECT d.*, p.name AS project_name, p.primary_host AS primary_host FROM deploys d JOIN projects p ON p.id = d.project_id ORDER BY d.created_at DESC LIMIT ?",
    )
    .all(limit)
    .map((r) => ({ ...toDeploy(r as Row), projectName: String((r as Row).project_name), primaryHost: String((r as Row).primary_host ?? "") }));
}

export function countDeploysSince(iso: string): number {
  const row = open().prepare("SELECT count(*) AS n FROM deploys WHERE created_at >= ?").get(iso) as Row;
  return Number(row.n);
}

/** The source of the most recent deploy, so a project can be redeployed without uploading again. */
export function latestUploadId(projectId: string): string | null {
  const row = open()
    .prepare("SELECT upload_id FROM deploys WHERE project_id = ? AND upload_id IS NOT NULL ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as Row | undefined;
  return (row?.upload_id as string | undefined) ?? null;
}

/** Every deploy's project and saved source, newest first, for deciding which sources can be deleted. */
export function listDeployUploadRefs(): { projectId: string; uploadId: string | null }[] {
  return open()
    .prepare("SELECT project_id, upload_id FROM deploys ORDER BY created_at DESC")
    .all()
    .map((r) => ({ projectId: String((r as Row).project_id), uploadId: ((r as Row).upload_id as string | null) ?? null }));
}

export function updateProjectEnv(id: string, envEncrypted: string | null): void {
  open().prepare("UPDATE projects SET env_encrypted = ? WHERE id = ?").run(envEncrypted, id);
}

export function getDeploy(id: string): Deploy | null {
  const row = open().prepare("SELECT * FROM deploys WHERE id = ?").get(id);
  return row ? toDeploy(row as Row) : null;
}

export function listDeploys(projectId: string): Deploy[] {
  return open()
    .prepare("SELECT * FROM deploys WHERE project_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(projectId)
    .map((r) => toDeploy(r as Row));
}

export function updateDeploy(id: string, status: DeployStatus, error: string | null = null): void {
  const finished = status === "live" || status === "failed" ? new Date().toISOString() : null;
  open().prepare("UPDATE deploys SET status = ?, error = ?, finished_at = ? WHERE id = ?").run(status, error, finished, id);
}

export type DomainStatus = "pending" | "verified";

export interface DomainRecord {
  id: string;
  name: string;
  /** Secret value the owner must publish in DNS to prove they control the domain. */
  token: string;
  status: DomainStatus;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ProjectHost {
  host: string;
  projectId: string;
  domainId: string;
  createdAt: string;
}

const toDomain = (r: Row): DomainRecord => ({
  id: String(r.id),
  name: String(r.name),
  token: String(r.token),
  status: r.status as DomainStatus,
  verifiedAt: (r.verified_at as string | null) ?? null,
  createdAt: String(r.created_at),
});

const toHost = (r: Row): ProjectHost => ({
  host: String(r.host),
  projectId: String(r.project_id),
  domainId: String(r.domain_id),
  createdAt: String(r.created_at),
});

export function createDomain(input: { name: string; token: string; status: DomainStatus }): DomainRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  open()
    .prepare("INSERT INTO domains (id, name, token, status, verified_at, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, input.name, input.token, input.status, input.status === "verified" ? now : null, now);
  return getDomain(id)!;
}

export function getDomain(id: string): DomainRecord | null {
  const row = open().prepare("SELECT * FROM domains WHERE id = ?").get(id);
  return row ? toDomain(row as Row) : null;
}

export function getDomainByName(name: string): DomainRecord | null {
  const row = open().prepare("SELECT * FROM domains WHERE name = ?").get(name);
  return row ? toDomain(row as Row) : null;
}

export function listDomains(): DomainRecord[] {
  return open().prepare("SELECT * FROM domains ORDER BY created_at ASC").all().map((r) => toDomain(r as Row));
}

export function markDomainVerified(id: string): void {
  open().prepare("UPDATE domains SET status = 'verified', verified_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function deleteDomain(id: string): void {
  open().prepare("DELETE FROM domains WHERE id = ?").run(id);
}

export function listHostsForDomain(domainId: string): ProjectHost[] {
  return open().prepare("SELECT * FROM project_hosts WHERE domain_id = ? ORDER BY host").all(domainId).map((r) => toHost(r as Row));
}

export function listProjectHosts(projectId: string): ProjectHost[] {
  return open().prepare("SELECT * FROM project_hosts WHERE project_id = ? ORDER BY created_at, host").all(projectId).map((r) => toHost(r as Row));
}

export function getHostBinding(host: string): ProjectHost | null {
  const row = open().prepare("SELECT * FROM project_hosts WHERE host = ?").get(host);
  return row ? toHost(row as Row) : null;
}

export function addProjectHost(input: { host: string; projectId: string; domainId: string }): void {
  open()
    .prepare("INSERT INTO project_hosts (host, project_id, domain_id, created_at) VALUES (?,?,?,?)")
    .run(input.host, input.projectId, input.domainId, new Date().toISOString());
}

/** Removes a hostname. If it was the primary one, another hostname of the project takes over. */
export function removeProjectHost(projectId: string, host: string): void {
  const db = open();
  db.prepare("DELETE FROM project_hosts WHERE host = ? AND project_id = ?").run(host, projectId);
  const project = getProject(projectId);
  if (project && project.primaryHost === host) {
    const next = listProjectHosts(projectId)[0];
    db.prepare("UPDATE projects SET primary_host = ? WHERE id = ?").run(next?.host ?? "", projectId);
  }
}

export function setPrimaryHost(projectId: string, host: string): void {
  open().prepare("UPDATE projects SET primary_host = ? WHERE id = ?").run(host, projectId);
}

/** Every running project with the hostnames that should reach it, for building the proxy config. */
export function listRunningRoutes(): { hosts: string[]; port: number }[] {
  const running = listProjects().filter((p) => p.status === "running" && p.hostPort !== null);
  return running
    .map((p) => ({ hosts: listProjectHosts(p.id).map((h) => h.host), port: p.hostPort as number }))
    .filter((route) => route.hosts.length > 0);
}

export function getSetting(key: string): string | null {
  const row = open().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return row ? String(row.value) : null;
}

export function setSetting(key: string, value: string | null): void {
  if (value === null) open().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else open().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

/** "paused" is on purpose (the owner paused it, or it came back paused from a restore). */
export type DatabaseStatus = "creating" | "running" | "failed" | "stopped" | "paused";

export interface DatabaseRecord {
  id: string;
  name: string;
  engine: string;
  version: string;
  database: string;
  username: string;
  secretEncrypted: string;
  container: string;
  volume: string;
  status: DatabaseStatus;
  error: string | null;
  createdAt: string;
}

const toDatabase = (r: Row): DatabaseRecord => ({
  id: String(r.id),
  name: String(r.name),
  engine: String(r.engine),
  version: String(r.version),
  database: String(r.database_name),
  username: String(r.username),
  secretEncrypted: String(r.secret_encrypted),
  container: String(r.container),
  volume: String(r.volume),
  status: r.status as DatabaseStatus,
  error: (r.error as string | null) ?? null,
  createdAt: String(r.created_at),
});

export function createDatabaseRecord(input: Omit<DatabaseRecord, "id" | "status" | "error" | "createdAt">): DatabaseRecord {
  const id = randomUUID();
  open()
    .prepare(
      "INSERT INTO databases (id, name, engine, version, database_name, username, secret_encrypted, container, volume, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(id, input.name, input.engine, input.version, input.database, input.username, input.secretEncrypted, input.container, input.volume, "creating", new Date().toISOString());
  return getDatabaseRecord(id)!;
}

export function getDatabaseRecord(id: string): DatabaseRecord | null {
  const row = open().prepare("SELECT * FROM databases WHERE id = ?").get(id);
  return row ? toDatabase(row as Row) : null;
}

export function getDatabaseByName(name: string): DatabaseRecord | null {
  const row = open().prepare("SELECT * FROM databases WHERE name = ?").get(name);
  return row ? toDatabase(row as Row) : null;
}

export function listDatabaseRecords(): DatabaseRecord[] {
  return open().prepare("SELECT * FROM databases ORDER BY created_at DESC").all().map((r) => toDatabase(r as Row));
}

export function updateDatabaseStatus(id: string, status: DatabaseStatus, error: string | null = null): void {
  open().prepare("UPDATE databases SET status = ?, error = ? WHERE id = ?").run(status, error, id);
}

export function deleteDatabaseRecord(id: string): void {
  open().prepare("DELETE FROM databases WHERE id = ?").run(id);
}

export function deleteProject(id: string): void {
  open().prepare("DELETE FROM projects WHERE id = ?").run(id);
}
