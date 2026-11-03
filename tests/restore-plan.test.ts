import { describe, expect, it } from "vitest";
import { planPause } from "@/lib/restore-plan";

const project = (id: string, status: string, container: string | null = `c-${id}`) => ({ id, status, container });
const database = (id: string, name: string, status: string) => ({ id, name, status, container: `renver-db-${name}` });

describe("planPause", () => {
  it("pauses every project that has a container", () => {
    const plan = planPause({ projects: [project("a", "running"), project("b", "stopped"), project("c", "paused")], databases: [], dumps: [] });
    expect(plan.projects.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves projects with no container, and ones deploying, alone", () => {
    const plan = planPause({ projects: [project("a", "failed", null), project("b", "deploying"), project("c", "created", null)], databases: [], dumps: [] });
    expect(plan.projects).toEqual([]);
  });

  it("pauses databases that exist, and skips ones still being created or that failed", () => {
    const plan = planPause({
      projects: [],
      databases: [database("1", "shop", "running"), database("2", "blog", "creating"), database("3", "old", "failed"), database("4", "wiki", "stopped")],
      dumps: [],
    });
    expect(plan.databases.map((d) => d.id)).toEqual(["1", "4"]);
  });

  it("picks the newest dump that belongs to each database to apply when it is resumed", () => {
    const plan = planPause({
      projects: [],
      databases: [database("1", "shop", "running"), database("2", "shop-two", "running"), database("3", "blog", "running")],
      dumps: [
        "shop-20261101T000000Z-manual.sql.gz",
        "shop-20261103T000000Z-manual.sql.gz",
        "shop-two-20261105T000000Z-manual.sql.gz",
      ],
    });
    expect(plan.databases.map((d) => [d.id, d.dump])).toEqual([
      ["1", "shop-20261103T000000Z-manual.sql.gz"],
      ["2", "shop-two-20261105T000000Z-manual.sql.gz"],
      ["3", null],
    ]);
  });

  it("ignores names that are not dumps", () => {
    const plan = planPause({ projects: [], databases: [database("1", "shop", "running")], dumps: ["notes.txt"] });
    expect(plan.databases[0]!.dump).toBeNull();
  });
});
