"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import type { AnalyzedUpload } from "@/lib/uploads";
import { api } from "@/lib/client-api";

type Source = "github" | "zip";

function GithubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function ImportCards() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState<Source | null>(null);
  const [error, setError] = useState<{ source: Source; message: string } | null>(null);

  const goToConfigure = (upload: AnalyzedUpload) => router.push(`/new/configure?upload=${upload.uploadId}`);

  const run = async (source: Source, task: () => Promise<AnalyzedUpload>) => {
    setBusy(source);
    setError(null);
    try {
      goToConfigure(await task());
    } catch (e) {
      setError({ source, message: e instanceof Error ? e.message : "Something went wrong." });
      setBusy(null);
    }
  };

  const handleGithub = (event: FormEvent) => {
    event.preventDefault();
    void run("github", () =>
      api<AnalyzedUpload>("/api/import/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, branch: branch.trim() || undefined }),
      }),
    );
  };

  const handleZip = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    void run("zip", () => api<AnalyzedUpload>("/api/analyze", { method: "POST", body: form }));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    setFile(event.dataTransfer.files[0] ?? null);
  };

  return (
    <div className="import-grid">
      <form className="card import-card" onSubmit={handleGithub}>
        <div className="card-head">
          <h2 className="h3" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GithubMark /> Import Git Repository
          </h2>
          <p className="sub">Clone a public GitHub repository.</p>
        </div>
        <div className="card-pad">
          <label className="field">
            <span className="label">Repository</span>
            <input
              className="input mono"
              placeholder="github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <span className="hint">A full URL, or just owner/repo.</span>
          </label>
          <label className="field">
            <span className="label">Branch <span className="faint">(optional)</span></span>
            <input
              className="input mono"
              placeholder="default branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {error?.source === "github" && <p className="notice error" role="alert">{error.message}</p>}
        </div>
        <div className="card-foot">
          <span className="small muted">Private repositories are not supported yet.</span>
          <button type="submit" className="btn primary" disabled={!url.trim() || busy !== null}>
            {busy === "github" ? "Cloning…" : "Continue"}
          </button>
        </div>
      </form>

      <form className="card import-card" onSubmit={handleZip}>
        <div className="card-head">
          <h2 className="h3">Upload a ZIP</h2>
          <p className="sub">Zip your project folder and drop it here.</p>
        </div>
        <div className="card-pad">
          <label
            className={`dropzone${isDragging ? " drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              className="sr-only"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="picked">{file.name}</span>
            ) : (
              <>
                <strong style={{ color: "var(--text)" }}>Drop a .zip here</strong>
                <span className="small">or click to browse · up to 200 MB</span>
              </>
            )}
          </label>
          {error?.source === "zip" && <p className="notice error" role="alert">{error.message}</p>}
        </div>
        <div className="card-foot">
          <span className="small muted">node_modules and .git are skipped.</span>
          <button type="submit" className="btn primary" disabled={!file || busy !== null}>
            {busy === "zip" ? "Uploading…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
