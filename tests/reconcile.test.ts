import { describe, expect, it } from "vitest";
import { makeExclusive, reconcile, type ReconcileDeps } from "@/lib/reconcile";

interface World {
  projects: { id: string; name: string; status: string; container: string | null; hosts: string[] }[];
  databases: { id: string; name: string; status: string; container: string }[];
  running: Set<string>;
  dockerDown: boolean;
  startFails: Set<string>;
  caddyUp: boolean;
  liveHosts: string[] | null;
  applied: number;
  started: string[];
}

function world(partial: Partial<World> = {}): World {
  return {
    projects: [],
    databases: [],
    running: new Set(),
    dockerDown: false,
    startFails: new Set(),
    caddyUp: true,
    liveHosts: [],
    applied: 0,
    started: [],
    ...partial,
  };
}

function depsFor(w: World): ReconcileDeps {
  return {
    projects: () => w.projects,
    databases: () => w.databases,
    runningContainers: async () => {
      if (w.dockerDown) throw new Error("docker is not reachable");
      return new Set(w.running);
    },
    startContainer: async (name) => {
      if (w.startFails.has(name)) throw new Error(`no such container: ${name}`);
      w.started.push(name);
      w.running.add(name);
    },
    setProjectStatus: (id, status) => {
      w.projects.find((p) => p.id === id)!.status = status;
    },
    setDatabaseStatus: (id, status) => {
      w.databases.find((d) => d.id === id)!.status = status;
    },
    proxy: {
      isUp: async () => w.caddyUp,
      liveHosts: async () => w.liveHosts,
      desiredHosts: () =>
        w.projects.filter((p) => p.status === "running").flatMap((p) => p.hosts).sort(),
      apply: async () => {
        w.applied += 1;
        w.caddyUp = true;
        w.liveHosts = w.projects.filter((p) => p.status === "running").flatMap((p) => p.hosts).sort();
        return true;
      },
    },
  };
}

const app = (id: string, status = "running") => ({
  id,
  name: id,
  status,
  container: `c-${id}`,
  hosts: [`${id}.example.com`],
});

describe("reconcile: app containers", () => {
  it("starts a container that died while its project is marked running", async () => {
    const w = world({ projects: [app("a")], caddyUp: true, liveHosts: ["a.example.com"] });
    const report = await reconcile(depsFor(w));
    expect(w.started).toEqual(["c-a"]);
    expect(report.restarted).toEqual(["c-a"]);
    expect(w.projects[0]!.status).toBe("running");
  });

  it("leaves healthy containers alone", async () => {
    const w = world({ projects: [app("a")], running: new Set(["c-a"]), liveHosts: ["a.example.com"] });
    const report = await reconcile(depsFor(w));
    expect(w.started).toEqual([]);
    expect(report.restarted).toEqual([]);
  });

  it("marks a project stopped when its container cannot be started, and drops its routes", async () => {
    const w = world({
      projects: [app("a"), app("b")],
      running: new Set(["c-b"]),
      startFails: new Set(["c-a"]),
      liveHosts: ["a.example.com", "b.example.com"],
    });
    const report = await reconcile(depsFor(w));
    expect(w.projects.find((p) => p.id === "a")!.status).toBe("stopped");
    expect(report.markedStopped).toEqual(["a"]);
    expect(w.applied).toBe(1);
    expect(w.liveHosts).toEqual(["b.example.com"]);
  });

  it("marks a stopped project running again once its container is back", async () => {
    const w = world({ projects: [app("a", "stopped")], running: new Set(["c-a"]), liveHosts: [] });
    const report = await reconcile(depsFor(w));
    expect(w.projects[0]!.status).toBe("running");
    expect(report.markedRunning).toEqual(["a"]);
    expect(w.liveHosts).toEqual(["a.example.com"]);
  });

  it("ignores projects that are deploying, failed, or have no container", async () => {
    const w = world({
      projects: [app("d", "deploying"), app("f", "failed"), { ...app("n"), container: null }],
    });
    const report = await reconcile(depsFor(w));
    expect(w.started).toEqual([]);
    expect(report.markedStopped).toEqual([]);
  });

  it("keeps going when one container fails to start", async () => {
    const w = world({ projects: [app("a"), app("b")], startFails: new Set(["c-a"]), liveHosts: [] });
    const report = await reconcile(depsFor(w));
    expect(report.restarted).toEqual(["c-b"]);
    expect(report.errors.some((e) => e.includes("c-a"))).toBe(true);
  });
});

describe("reconcile: databases", () => {
  it("restarts a database container that is down", async () => {
    const w = world({ databases: [{ id: "d1", name: "shop", status: "running", container: "renver-db-shop" }] });
    const report = await reconcile(depsFor(w));
    expect(w.started).toEqual(["renver-db-shop"]);
    expect(report.restarted).toEqual(["renver-db-shop"]);
  });

  it("marks a database stopped when it cannot be started", async () => {
    const w = world({
      databases: [{ id: "d1", name: "shop", status: "running", container: "renver-db-shop" }],
      startFails: new Set(["renver-db-shop"]),
    });
    await reconcile(depsFor(w));
    expect(w.databases[0]!.status).toBe("stopped");
  });

  it("does not touch a database that is still being created", async () => {
    const w = world({ databases: [{ id: "d1", name: "x", status: "creating", container: "renver-db-x" }] });
    await reconcile(depsFor(w));
    expect(w.started).toEqual([]);
  });
});

describe("reconcile: Docker unreachable", () => {
  it("changes no statuses when it cannot see what is running", async () => {
    const w = world({ projects: [app("a")], dockerDown: true, liveHosts: ["a.example.com"] });
    const report = await reconcile(depsFor(w));
    expect(w.projects[0]!.status).toBe("running");
    expect(w.started).toEqual([]);
    expect(report.errors[0]).toMatch(/docker/i);
  });
});

describe("reconcile: proxy", () => {
  it("restores routes when Caddy is down", async () => {
    const w = world({ projects: [app("a")], running: new Set(["c-a"]), caddyUp: false, liveHosts: null });
    const report = await reconcile(depsFor(w));
    expect(report.proxyApplied).toBe(true);
    expect(w.caddyUp).toBe(true);
  });

  it("restores routes when Caddy is up but lost them", async () => {
    const w = world({ projects: [app("a")], running: new Set(["c-a"]), liveHosts: [] });
    await reconcile(depsFor(w));
    expect(w.liveHosts).toEqual(["a.example.com"]);
  });

  it("does nothing when routes already match", async () => {
    const w = world({ projects: [app("a")], running: new Set(["c-a"]), liveHosts: ["a.example.com"] });
    const report = await reconcile(depsFor(w));
    expect(report.proxyApplied).toBe(false);
    expect(w.applied).toBe(0);
  });

  it("does not start Caddy when there is nothing to serve", async () => {
    const w = world({ projects: [], caddyUp: false, liveHosts: null });
    const report = await reconcile(depsFor(w));
    expect(report.proxyApplied).toBe(false);
    expect(w.caddyUp).toBe(false);
  });

  it("clears stale routes when no project is running any more", async () => {
    const w = world({ projects: [app("a", "stopped")], caddyUp: true, liveHosts: ["gone.example.com"] });
    await reconcile(depsFor(w));
    expect(w.applied).toBe(1);
    expect(w.liveHosts).toEqual([]);
  });
});

describe("makeExclusive", () => {
  it("leaves a paused project paused: it is not restarted and not marked running", async () => {
    const w = world({ projects: [{ id: "p1", name: "Paused app", status: "paused", container: "renver-paused", hosts: ["a.localhost"] }] });
    const report = await reconcile(depsFor(w));
    expect(w.started).toEqual([]);
    expect(w.projects[0]!.status).toBe("paused");
    expect(report.restarted).toEqual([]);
    expect(report.markedStopped).toEqual([]);
  });

  it("skips a run that starts while the previous one is still going", async () => {
    let release!: () => void;
    let runs = 0;
    const exclusive = makeExclusive(
      () =>
        new Promise<void>((resolve) => {
          runs += 1;
          release = resolve;
        }),
    );
    const first = exclusive();
    expect(await exclusive()).toBe("skipped");
    release();
    expect(await first).toBe("ran");
    expect(runs).toBe(1);
    const third = exclusive();
    release();
    expect(await third).toBe("ran");
  });

  it("allows another run after one fails", async () => {
    let calls = 0;
    const exclusive = makeExclusive(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    });
    await expect(exclusive()).rejects.toThrow("boom");
    expect(await exclusive()).toBe("ran");
  });
});
