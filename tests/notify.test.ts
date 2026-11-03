import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/alerts";
import { buildNotification, describeTarget, diffAlerts, validateNotifyUrl } from "@/lib/notify";

const alert = (id: string, severity: Alert["severity"] = "error"): Alert => ({ id, severity, title: `Title ${id}`, detail: "d" });

describe("validateNotifyUrl", () => {
  it("accepts http(s) addresses and treats blank as 'turn off'", () => {
    expect(validateNotifyUrl("https://discord.com/api/webhooks/1/abc")).toEqual({ ok: true, value: "https://discord.com/api/webhooks/1/abc" });
    expect(validateNotifyUrl("  ")).toEqual({ ok: true, value: "" });
  });

  it("rejects anything else", () => {
    expect(validateNotifyUrl("not a url").ok).toBe(false);
    expect(validateNotifyUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateNotifyUrl("javascript:alert(1)").ok).toBe(false);
  });
});

describe("buildNotification", () => {
  it("sends Discord and Slack both the field each one reads", () => {
    const discord = buildNotification("https://discord.com/api/webhooks/1/abc", "hello");
    expect(JSON.parse(discord.body)).toMatchObject({ content: "hello", text: "hello" });
    expect(discord.url).toBe("https://discord.com/api/webhooks/1/abc");
  });

  it("builds a Telegram message from the bot URL", () => {
    const tg = buildNotification("https://api.telegram.org/bot123:ABC/sendMessage?chat_id=99", "hello");
    expect(tg.url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(tg.body)).toEqual({ chat_id: "99", text: "hello" });
  });

  it("posts JSON to anything else", () => {
    const generic = buildNotification("https://example.com/hook", "hello");
    expect(generic.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(generic.body).text).toBe("hello");
  });
});

describe("describeTarget", () => {
  it("shows where messages go without leaking the secret part", () => {
    expect(describeTarget("https://discord.com/api/webhooks/1/secrettoken")).toBe("discord.com");
    expect(describeTarget("https://api.telegram.org/bot123:ABC/sendMessage?chat_id=9")).toBe("api.telegram.org");
  });
});

describe("diffAlerts", () => {
  it("reports only alerts that were not already reported", () => {
    const { fresh, activeIds } = diffAlerts(["a"], [alert("a"), alert("b")]);
    expect(fresh.map((a) => a.id)).toEqual(["b"]);
    expect(activeIds.sort()).toEqual(["a", "b"]);
  });

  it("forgets resolved alerts, so a problem that comes back is reported again", () => {
    const first = diffAlerts([], [alert("a")]);
    const resolved = diffAlerts(first.activeIds, []);
    expect(resolved.activeIds).toEqual([]);
    expect(diffAlerts(resolved.activeIds, [alert("a")]).fresh.map((a) => a.id)).toEqual(["a"]);
  });

  it("does not notify about informational alerts", () => {
    const { fresh, activeIds } = diffAlerts([], [alert("tip", "info"), alert("warn", "warning")]);
    expect(fresh.map((a) => a.id)).toEqual(["warn"]);
    expect(activeIds).toEqual(["warn"]);
  });
});
