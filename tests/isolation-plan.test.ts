import { describe, expect, it } from "vitest";
import { planIsolation } from "@/lib/isolation-plan";

const input = {
  projects: [
    { id: "a", container: "renver-a-1" },
    { id: "b", container: "renver-b-1" },
    { id: "c", container: null },
  ],
  databases: [
    { id: "d1", container: "renver-db-one" },
    { id: "d2", container: "renver-db-two" },
  ],
  links: [{ projectId: "a", databaseId: "d1" }],
};

describe("planIsolation", () => {
  const plan = planIsolation(input);
  const on = (network: string) => plan.connects.filter((c) => c.network === network).map((c) => c.container).sort();

  it("puts each container on a network of its own", () => {
    expect(on("renver-app-a")).toEqual(["renver-a-1"]);
    expect(on("renver-app-b")).toEqual(["renver-b-1"]);
    expect(plan.networks).not.toContain("renver-app-c");
  });

  it("lets an app reach only the database it is linked to", () => {
    expect(on("renver-db-d1")).toEqual(["renver-a-1", "renver-db-one"]);
    expect(on("renver-db-d2")).toEqual(["renver-db-two"]);
  });

  it("leaves the shared network for every container that exists", () => {
    expect([...plan.leaveShared].sort()).toEqual(["renver-a-1", "renver-b-1", "renver-db-one", "renver-db-two"]);
  });

  it("ignores a link to an app with no container", () => {
    const p = planIsolation({ ...input, links: [{ projectId: "c", databaseId: "d1" }] });
    expect(p.connects.filter((c) => c.network === "renver-db-d1").map((c) => c.container)).toEqual(["renver-db-one"]);
  });
});
