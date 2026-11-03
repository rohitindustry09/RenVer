import fs from "node:fs";
import { config } from "./config";
import { dumpDirFor, dumpFileName, dumpPath, parseDumpName, type DumpInfo, type DumpKind } from "./db-dumps";
import { execFromGzipFile, execToGzipFile } from "./docker-dump";
import {
  createDatabaseRecord,
  deleteDatabaseRecord,
  getDatabaseByName,
  getDatabaseRecord,
  getProject,
  getSetting,
  listDatabaseRecords,
  listProjects,
  setSetting,
  updateDatabaseStatus,
  updateProjectEnv,
  type DatabaseRecord,
} from "./db";
import {
  ENGINES,
  buildConnectionUrl,
  deriveIdentifiers,
  dumpCommand,
  envForEngine,
  generatePassword,
  isEngine,
  readyProbe,
  restoreCommand,
  validateDatabaseName,
  type Engine,
} from "./database-spec";
import {
  dockerContainerExists,
  dockerRemove,
  dockerRemoveVolume,
  dockerRunDatabase,
  dockerRemoveNetwork,
  dockerStart,
  dockerStop,
  ensureNetwork,
  runningContainerNames,
  waitForProbe,
} from "./docker";
import { variablesHoldingUrl } from "./database-links";
import { dbNetworkName } from "./network-names";
import { enqueue } from "./queue";
import { decryptEnv, encryptEnv } from "./secrets";
import { parseEnv } from "./validate";

export interface DatabaseCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionUrl: string;
}

const DEFAULT_LINK_VARIABLE = "DATABASE_URL";
const MAX_ERROR_LENGTH = 300;

export class DatabaseError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

/** Starts creating a database in the background and returns the new record straight away. */
export function createDatabase(input: { name: string; engine: string; version: string }): DatabaseRecord {
  const name = validateDatabaseName(input.name);
  if (!name.ok) throw new DatabaseError(name.error);
  if (!isEngine(input.engine)) throw new DatabaseError("Unknown database engine.");
  const spec = ENGINES[input.engine];
  if (!spec.versions.includes(input.version)) throw new DatabaseError(`Pick a supported ${spec.label} version.`);
  if (getDatabaseByName(name.value)) throw new DatabaseError("A database with that name already exists.", 409);

  const ids = deriveIdentifiers(name.value);
  const password = generatePassword();
  const rootPassword = generatePassword();
  const secretEncrypted = encryptEnv({ password, rootPassword });
  if (!secretEncrypted) throw new DatabaseError("Could not store credentials.", 500);

  const record = createDatabaseRecord({
    name: name.value,
    engine: input.engine,
    version: input.version,
    database: ids.database,
    username: ids.username,
    secretEncrypted,
    container: ids.container,
    volume: ids.volume,
  });

  void enqueue(() => provision(record, password, rootPassword));
  return record;
}

async function provision(record: DatabaseRecord, password: string, rootPassword: string): Promise<void> {
  const engine = isEngine(record.engine) ? record.engine : null;
  if (!engine) return;
  const spec = ENGINES[engine];
  const lines: string[] = [];
  try {
    await ensureNetwork(dbNetworkName(record.id));
    await dockerRunDatabase({
      name: record.container,
      image: `${spec.image}:${record.version}`,
      volume: record.volume,
      dataDir: spec.dataDir,
      databaseId: record.id,
      network: dbNetworkName(record.id),
      env: envForEngine(engine, { username: record.username, password, database: record.database, rootPassword }),
      onLine: (line) => lines.push(line),
    });
    await waitForProbe(record.container, readyProbe(engine, record.username, record.database));
    if (getDatabaseRecord(record.id)) updateDatabaseStatus(record.id, "running");
  } catch (error) {
    await dockerRemove(record.container).catch(() => undefined);
    await dockerRemoveVolume(record.volume).catch(() => undefined);
    const detail = lines.filter((l) => l.trim()).at(-1) ?? (error instanceof Error ? error.message : String(error));
    if (getDatabaseRecord(record.id)) updateDatabaseStatus(record.id, "failed", detail.slice(0, MAX_ERROR_LENGTH));
  }
}

/** Marks running databases as stopped (and the reverse) by asking Docker what is actually running. */
export async function listDatabasesWithLiveStatus(): Promise<DatabaseRecord[]> {
  const records = listDatabaseRecords();
  let running: Set<string>;
  try {
    running = new Set(await runningContainerNames("renver.kind=database"));
  } catch {
    return records;
  }
  return records.map((r) => {
    if (r.status === "running" && !running.has(r.container)) return { ...r, status: "stopped" };
    if (r.status === "stopped" && running.has(r.container)) return { ...r, status: "running" };
    return r;
  });
}

export function credentialsFor(record: DatabaseRecord): DatabaseCredentials {
  if (!isEngine(record.engine)) throw new DatabaseError("Unknown database engine.", 500);
  const { password } = decryptEnv(record.secretEncrypted);
  if (!password) throw new DatabaseError("Credentials are missing.", 500);
  return {
    host: record.container,
    port: ENGINES[record.engine].port,
    database: record.database,
    username: record.username,
    password,
    connectionUrl: buildConnectionUrl({
      engine: record.engine,
      username: record.username,
      password,
      host: record.container,
      database: record.database,
    }),
  };
}

/** Adds the connection string to a project's environment, keeping its other variables. */
export function linkDatabase(projectId: string, record: DatabaseRecord, variable: string = DEFAULT_LINK_VARIABLE): string {
  const project = getProject(projectId);
  if (!project) throw new DatabaseError("Project not found.", 404);
  if (project.status === "deploying") throw new DatabaseError("A deploy is in progress. Try again when it finishes.", 409);
  if (record.status !== "running") throw new DatabaseError("The database is not running yet.", 409);

  const { connectionUrl } = credentialsFor(record);
  const next = parseEnv({ ...decryptEnv(project.envEncrypted), [variable]: connectionUrl });
  updateProjectEnv(projectId, encryptEnv(next));
  return variable;
}

const MIN_DUMP_BYTES = 20;
const busyDatabases = new Set<string>();

async function exclusive<T>(record: DatabaseRecord, task: () => Promise<T>): Promise<T> {
  if (busyDatabases.has(record.id)) throw new DatabaseError("A backup or restore of this database is already running.", 409);
  busyDatabases.add(record.id);
  try {
    return await task();
  } finally {
    busyDatabases.delete(record.id);
  }
}

function runningEngine(record: DatabaseRecord): Engine {
  if (!isEngine(record.engine)) throw new DatabaseError("Unknown database engine.", 500);
  if (record.status !== "running") throw new DatabaseError("The database is not running.", 409);
  return record.engine;
}

/** Saves what is inside the database container as a gzipped SQL file. */
export function dumpDatabase(record: DatabaseRecord, kind: DumpKind): Promise<DumpInfo> {
  return exclusive(record, async () => {
    const engine = runningEngine(record);
    fs.mkdirSync(dumpDirFor(config.dataDir), { recursive: true });
    const name = dumpFileName(record.name, new Date(), kind);
    const file = dumpPath(config.dataDir, record.name, name);
    await execToGzipFile(record.container, dumpCommand(engine, record.username, record.database), file);
    const bytes = fs.statSync(file).size;
    if (bytes < MIN_DUMP_BYTES) {
      fs.rmSync(file, { force: true });
      throw new DatabaseError("The backup came out empty, so it was not kept.", 500);
    }
    return { name, bytes, createdAt: parseDumpName(name)!.createdAt, kind };
  });
}

const restoreDumpKey = (databaseId: string): string => `restore-dump:${databaseId}`;

/** Remembers a dump to load into this database the next time it is resumed (set when a backup is restored). */
export function setPendingRestoreDump(databaseId: string, dumpName: string | null): void {
  setSetting(restoreDumpKey(databaseId), dumpName);
}

/** Stops the database container. Its data stays in its volume; resume brings it back. */
export function pauseDatabase(record: DatabaseRecord): Promise<void> {
  return exclusive(record, async () => {
    if (record.status === "creating") throw new DatabaseError("The database is still being created.", 409);
    await dockerStop(record.container);
    updateDatabaseStatus(record.id, "paused");
  });
}

/**
 * Starts a paused database. If its container no longer exists (a new machine, or it was removed), it is created again
 * with the same credentials. If a restore left a saved copy for it, that data is loaded once it accepts connections.
 */
export function resumeDatabase(record: DatabaseRecord): Promise<void> {
  return exclusive(record, async () => {
    if (!isEngine(record.engine)) throw new DatabaseError("Unknown database engine.", 500);
    if (record.status === "creating") throw new DatabaseError("The database is still being created.", 409);
    const engine = record.engine;
    const spec = ENGINES[engine];

    if (await dockerContainerExists(record.container)) {
      await dockerStart(record.container);
    } else {
      const { password, rootPassword } = decryptEnv(record.secretEncrypted);
      if (!password || !rootPassword) throw new DatabaseError("Credentials are missing.", 500);
      await ensureNetwork(dbNetworkName(record.id));
      await dockerRunDatabase({
        name: record.container,
        image: `${spec.image}:${record.version}`,
        volume: record.volume,
        dataDir: spec.dataDir,
        databaseId: record.id,
        network: dbNetworkName(record.id),
        env: envForEngine(engine, { username: record.username, password, database: record.database, rootPassword }),
        onLine: () => undefined,
      });
    }
    await waitForProbe(record.container, readyProbe(engine, record.username, record.database));

    const pending = getSetting(restoreDumpKey(record.id));
    if (pending) {
      const file = dumpPath(config.dataDir, record.name, pending);
      if (fs.existsSync(file)) {
        await execFromGzipFile(record.container, restoreCommand(engine, record.username, record.database), file);
      }
      setPendingRestoreDump(record.id, null);
    }
    updateDatabaseStatus(record.id, "running");
    // Linked apps that are already running need to see this database again, and older containers move to their own networks.
    const { isolateNetworks } = await import("./isolation");
    await isolateNetworks().catch(() => undefined);
  });
}

/** Replaces the database's contents with a saved dump. The current contents are saved first so this can be undone. */
export async function restoreDump(record: DatabaseRecord, name: string): Promise<{ safetyDump: string }> {
  const engine = runningEngine(record);
  const file = dumpPath(config.dataDir, record.name, name);
  if (!fs.existsSync(file)) throw new DatabaseError("Backup not found.", 404);
  const safety = await dumpDatabase(record, "manual");
  await exclusive(record, () => execFromGzipFile(record.container, restoreCommand(engine, record.username, record.database), file));
  return { safetyDump: safety.name };
}

export interface DatabaseLink {
  projectId: string;
  projectName: string;
  variable: string;
}

/** The projects whose environment holds this database's connection string. */
export function linkedProjectsFor(record: DatabaseRecord): DatabaseLink[] {
  if (!isEngine(record.engine)) return [];
  let connectionUrl: string;
  try {
    connectionUrl = credentialsFor(record).connectionUrl;
  } catch {
    return [];
  }
  return listProjects().flatMap((project) =>
    variablesHoldingUrl(decryptEnv(project.envEncrypted), connectionUrl).map((variable) => ({
      projectId: project.id,
      projectName: project.name,
      variable,
    })),
  );
}

export async function deleteDatabase(record: DatabaseRecord): Promise<void> {
  await dockerRemove(record.container);
  await dockerRemoveVolume(record.volume);
  await dockerRemoveNetwork(dbNetworkName(record.id)).catch(() => undefined);
  deleteDatabaseRecord(record.id);
}
