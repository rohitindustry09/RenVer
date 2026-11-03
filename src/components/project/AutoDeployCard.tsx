"use client";

import { useFetch } from "@/hooks/useFetch";
import { CopyButton } from "../CopyButton";

type WebhookInfo =
  | { isGithub: false }
  | { isGithub: true; repo: string; branch: string | null; path: string; secret: string };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack-sm">
      <span className="small muted">{label}</span>
      <div className="toolbar">
        <code className="mono grow" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{value}</code>
        <CopyButton text={value} label="Copy" />
      </div>
    </div>
  );
}

/** Redeploy automatically whenever someone pushes to the repository this project came from. */
export function AutoDeployCard({ projectId }: { projectId: string }) {
  const { data } = useFetch<WebhookInfo>(`/api/projects/${projectId}/webhook`);
  if (!data || !data.isGithub) return null;

  const payloadUrl = `${typeof window === "undefined" ? "" : window.location.origin}${data.path}`;
  const isLocal = typeof window !== "undefined" && /^(localhost|127\.|\[::1\])/.test(window.location.hostname);

  return (
    <section className="card" aria-labelledby="autodeploy-heading">
      <div className="card-head">
        <h2 className="h3" id="autodeploy-heading">Auto-deploy from GitHub</h2>
        <p className="sub">
          Deploys again each time you push to <span className="mono">{data.repo}</span>
          {data.branch ? <> on <span className="mono">{data.branch}</span></> : " (its default branch)"}.
        </p>
      </div>
      <div className="card-pad stack">
        {isLocal && (
          <p className="notice warn">
            GitHub cannot reach <span className="mono">localhost</span>. This works once RenVer is on a server with a public address (or behind a tunnel),
            and you open it from that address.
          </p>
        )}
        <ol className="stack-sm" style={{ paddingLeft: 20 }}>
          <li>In the repository on GitHub, open <strong>Settings → Webhooks → Add webhook</strong>.</li>
          <li>Paste the two values below. Set <strong>Content type</strong> to <span className="mono">application/json</span> and choose <strong>Just the push event</strong>.</li>
        </ol>
        <Field label="Payload URL" value={payloadUrl} />
        <Field label="Secret" value={data.secret} />
      </div>
    </section>
  );
}
