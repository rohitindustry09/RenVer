import { describe, expect, it } from "vitest";
import { computeAlerts, type AlertInput } from "@/lib/alerts";

const now = new Date("2026-11-02T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const GB = 1024 ** 3;

const healthy: AlertInput = {
  now,
  projects: [{ id: "p1", name: "Shop", status: "running" }],
  databases: [{ id: "d1", name: "shop-db", status: "running", error: null }],
  domains: [{ name: "example.com", status: "verified" }],
  memory: { reservedMB: 1024, totalMB: 8192 },
  disk: { freeBytes: 100 * GB, totalBytes: 200 * GB },
  lastBackupAt: hoursAgo(5),
};

describe("computeAlerts", () => {
  it("has nothing to say when everything is fine", () => {
    expect(computeAlerts(healthy)).toEqual([]);
  });

  it("flags a failed project as an error that links to it", () => {
    const alerts = computeAlerts({ ...healthy, projects: [{ id: "p9", name: "Blog", status: "failed" }] });
    expect(alerts).toEqual([expect.objectContaining({ severity: "error", href: "/projects/p9", title: expect.stringContaining("Blog") })]);
  });

  it("flags a stopped project as a warning", () => {
    const alerts = computeAlerts({ ...healthy, projects: [{ id: "p9", name: "Blog", status: "stopped" }] });
    expect(alerts[0]).toMatchObject({ severity: "warning", href: "/projects/p9" });
  });

  it("ignores projects that are still building or have not started", () => {
    const alerts = computeAlerts({
      ...healthy,
      projects: [
        { id: "a", name: "A", status: "deploying" },
        { id: "b", name: "B", status: "created" },
      ],
    });
    expect(alerts).toEqual([]);
  });

  it("flags failed and stopped databases", () => {
    const alerts = computeAlerts({
      ...healthy,
      databases: [
        { id: "1", name: "one", status: "failed", error: "port busy" },
        { id: "2", name: "two", status: "stopped", error: null },
        { id: "3", name: "three", status: "creating", error: null },
      ],
    });
    expect(alerts.map((a) => a.severity)).toEqual(["error", "warning"]);
    expect(alerts[0]!.detail).toContain("port busy");
    expect(alerts.every((a) => a.href === "/databases")).toBe(true);
  });

  it("asks for ownership verification of pending domains", () => {
    const alerts = computeAlerts({ ...healthy, domains: [{ name: "new.example.org", status: "pending" }] });
    expect(alerts[0]).toMatchObject({ severity: "warning", href: "/domains", title: expect.stringContaining("new.example.org") });
  });

  it("warns when the apps' memory limits add up to nearly all of the machine's memory", () => {
    const alerts = computeAlerts({ ...healthy, memory: { reservedMB: 7600, totalMB: 8192 } });
    expect(alerts[0]).toMatchObject({ severity: "warning", href: "/settings" });
    expect(alerts[0]!.detail).toMatch(/7\.4 GB.*8\.0 GB/);
  });

  it("does not warn about memory right at the edge of the threshold", () => {
    expect(computeAlerts({ ...healthy, memory: { reservedMB: 7000, totalMB: 8192 } })).toEqual([]);
  });

  it("warns when disk space is low, by share or by absolute amount", () => {
    expect(computeAlerts({ ...healthy, disk: { freeBytes: 10 * GB, totalBytes: 200 * GB } })[0]).toMatchObject({ severity: "warning" });
    expect(computeAlerts({ ...healthy, disk: { freeBytes: 1.5 * GB, totalBytes: 20 * GB } })[0]).toMatchObject({ severity: "warning" });
  });

  it("says when there has never been a backup", () => {
    const alerts = computeAlerts({ ...healthy, lastBackupAt: null });
    expect(alerts[0]).toMatchObject({ severity: "info", href: "/settings" });
  });

  it("warns when the newest backup is more than two days old", () => {
    expect(computeAlerts({ ...healthy, lastBackupAt: hoursAgo(47) })).toEqual([]);
    const alerts = computeAlerts({ ...healthy, lastBackupAt: hoursAgo(50) });
    expect(alerts[0]).toMatchObject({ severity: "warning" });
    expect(alerts[0]!.detail).toMatch(/2 days/);
  });

  it("lists errors first, then warnings, then notes", () => {
    const alerts = computeAlerts({
      ...healthy,
      projects: [{ id: "p1", name: "Shop", status: "stopped" }, { id: "p2", name: "Blog", status: "failed" }],
      lastBackupAt: null,
    });
    expect(alerts.map((a) => a.severity)).toEqual(["error", "warning", "info"]);
  });

  it("gives every alert a unique id", () => {
    const alerts = computeAlerts({
      ...healthy,
      projects: [{ id: "p1", name: "A", status: "failed" }, { id: "p2", name: "B", status: "failed" }],
      lastBackupAt: null,
    });
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
  });
});

describe("computeAlerts secret warnings", () => {
  it("turns each secret warning into a warning that links to settings, without any secret", () => {
    const alerts = computeAlerts({ ...healthy, secretWarnings: [{ id: "password-short", message: "The panel password is short (6 characters). Use 12 or more." }] });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "secret-password-short", severity: "warning", href: "/settings" });
  });
});
