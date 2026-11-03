import { randomBytes } from "node:crypto";

import { ENGINES, isEngine, validateDatabaseName, type Engine, type EngineSpec, type NameResult } from "./database-engines";

export { ENGINES, isEngine, validateDatabaseName };
export type { Engine, EngineSpec, NameResult };

const MAX_USERNAME_LENGTH = 32;
const PASSWORD_LENGTH = 32;
const PASSWORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function deriveIdentifiers(name: string): {
  container: string;
  volume: string;
  database: string;
  username: string;
} {
  const database = name.replace(/-/g, "_");
  return {
    container: `renver-db-${name}`,
    volume: `renver-db-${name}`,
    database,
    username: `u_${database}`.slice(0, MAX_USERNAME_LENGTH),
  };
}

/** Random alphanumeric password with no modulo bias (rejection sampling). */
export function generatePassword(length: number = PASSWORD_LENGTH): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let result = "";
  while (result.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && result.length < length) result += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return result;
}

export function buildConnectionUrl(input: {
  engine: Engine;
  username: string;
  password: string;
  host: string;
  database: string;
}): string {
  const spec = ENGINES[input.engine];
  const user = encodeURIComponent(input.username);
  const pass = encodeURIComponent(input.password);
  return `${spec.scheme}://${user}:${pass}@${input.host}:${spec.port}/${input.database}`;
}

export function envForEngine(
  engine: Engine,
  input: { username: string; password: string; database: string; rootPassword: string },
): Record<string, string> {
  switch (engine) {
    case "postgres":
      return { POSTGRES_USER: input.username, POSTGRES_PASSWORD: input.password, POSTGRES_DB: input.database };
    case "mysql":
      return {
        MYSQL_ROOT_PASSWORD: input.rootPassword,
        MYSQL_USER: input.username,
        MYSQL_PASSWORD: input.password,
        MYSQL_DATABASE: input.database,
      };
    case "mariadb":
      return {
        MARIADB_ROOT_PASSWORD: input.rootPassword,
        MARIADB_USER: input.username,
        MARIADB_PASSWORD: input.password,
        MARIADB_DATABASE: input.database,
      };
  }
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

function checkedIdentifiers(username: string, database: string): void {
  if (!IDENTIFIER_PATTERN.test(username) || !IDENTIFIER_PATTERN.test(database)) {
    throw new Error("Database identifier contains unsupported characters.");
  }
}

/**
 * Commands run inside the container (docker exec). Passwords come from the container's own environment, so they never
 * appear on a command line outside it.
 */
export function dumpCommand(engine: Engine, username: string, database: string): string[] {
  checkedIdentifiers(username, database);
  switch (engine) {
    case "postgres":
      return ["sh", "-c", `PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U ${username} -d ${database} --clean --if-exists --no-owner`];
    case "mysql":
      return ["sh", "-c", `mysqldump -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines ${database}`];
    case "mariadb":
      return ["sh", "-c", `mariadb-dump -h 127.0.0.1 -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines ${database}`];
  }
}

/** Reads SQL on standard input (docker exec -i) and applies it to the database. */
export function restoreCommand(engine: Engine, username: string, database: string): string[] {
  checkedIdentifiers(username, database);
  switch (engine) {
    case "postgres":
      return ["sh", "-c", `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U ${username} -d ${database} -v ON_ERROR_STOP=1 -q`];
    case "mysql":
      return ["sh", "-c", `mysql -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" ${database}`];
    case "mariadb":
      return ["sh", "-c", `mariadb -h 127.0.0.1 -uroot -p"$MARIADB_ROOT_PASSWORD" ${database}`];
  }
}

/** The command run inside the container (docker exec) to check the database accepts connections. */
export function readyProbe(engine: Engine, username: string, database: string): string[] {
  switch (engine) {
    case "postgres":
      return ["pg_isready", "-h", "127.0.0.1", "-U", username, "-d", database];
    case "mysql":
      return ["sh", "-c", 'mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent'];
    case "mariadb":
      return ["sh", "-c", 'mariadb-admin ping -h 127.0.0.1 -uroot -p"$MARIADB_ROOT_PASSWORD" --silent'];
  }
}
