/** Client-safe database rules (no Node imports), shared by the page form and the server. */

export type Engine = "postgres" | "mysql" | "mariadb";

export interface EngineSpec {
  label: string;
  image: string;
  /** Pinned, tested versions only. Newer majors can change their data folder layout. */
  versions: readonly string[];
  port: number;
  dataDir: string;
  scheme: "postgres" | "mysql";
}

export const ENGINES: Record<Engine, EngineSpec> = {
  postgres: {
    label: "PostgreSQL",
    image: "postgres",
    versions: ["17", "16"],
    port: 5432,
    dataDir: "/var/lib/postgresql/data",
    scheme: "postgres",
  },
  mysql: { label: "MySQL", image: "mysql", versions: ["8.4"], port: 3306, dataDir: "/var/lib/mysql", scheme: "mysql" },
  mariadb: { label: "MariaDB", image: "mariadb", versions: ["11.4"], port: 3306, dataDir: "/var/lib/mysql", scheme: "mysql" },
};

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

export function isEngine(value: string): value is Engine {
  return Object.prototype.hasOwnProperty.call(ENGINES, value);
}

export function validateDatabaseName(input: string): NameResult {
  const value = input.trim().toLowerCase();
  if (!NAME_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Use 3 to 30 characters: lowercase letters, numbers and hyphens, starting with a letter.",
    };
  }
  return { ok: true, value };
}
