"use client";

import { useState, type FormEvent } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { validateNotifyUrl } from "@/lib/notify";

interface Status {
  isOn: boolean;
  target: string;
}

type Busy = "save" | "test" | "off" | null;

/** Where RenVer sends a message when something needs attention (an app crashed, a database stopped, disk is low…). */
export function NotificationsCard() {
  const { data, reload } = useFetch<Status>("/api/settings/notifications");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const checked = validateNotifyUrl(url);
  const call = async (kind: Exclude<Busy, null>, task: () => Promise<string>) => {
    setBusy(kind);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  };

  const put = (value: string) =>
    api<Status>("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!checked.ok || !url.trim()) return;
    void call("save", async () => {
      await put(url);
      setUrl("");
      return "Saved. Send a test message to check it works.";
    });
  };

  return (
    <form className="card" onSubmit={save} aria-labelledby="notify-heading">
      <div className="card-head">
        <h2 className="h3" id="notify-heading">Notifications</h2>
        <p className="sub">
          Get a message when an app fails or stops, a database stops, disk space runs low, or backups stop. Paste a Discord or Slack
          webhook address, a Telegram bot address, or any URL that accepts JSON.
        </p>
      </div>
      <div className="card-pad stack-sm">
        {data?.isOn && (
          <p className="notice" role="status">
            <span className="dot ok" aria-hidden="true" /> Sending to <span className="mono">{data.target}</span>
          </p>
        )}
        <label className="field">
          <span className="label">{data?.isOn ? "Change address" : "Webhook address"}</span>
          <input
            className="input mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            spellCheck={false}
          />
          {!checked.ok && url.trim() && <span className="hint" style={{ color: "var(--error)" }}>{checked.error}</span>}
          <span className="hint">Telegram: https://api.telegram.org/bot&lt;token&gt;/sendMessage?chat_id=&lt;id&gt;</span>
        </label>
        {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
      </div>
      <div className="card-foot">
        <div className="toolbar">
          {data?.isOn && (
            <>
              <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void call("test", async () => { await api("/api/settings/notifications", { method: "POST" }); return "Test message sent."; })}>
                {busy === "test" ? "Sending…" : "Send test"}
              </button>
              <button type="button" className="btn sm danger" disabled={busy !== null} onClick={() => void call("off", async () => { await put(""); return "Notifications are off."; })}>
                Turn off
              </button>
            </>
          )}
        </div>
        <button type="submit" className="btn primary sm" disabled={!url.trim() || !checked.ok || busy !== null}>{busy === "save" ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
