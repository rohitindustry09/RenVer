"use client";

/** Last resort: the root layout itself failed, so this page brings its own <html> and plain styling. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#000", color: "#ededed", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>RenVer hit a problem</h1>
          <p style={{ color: "#a1a1a1", margin: "0 0 20px" }}>Your apps keep running. Reload the page, and if it keeps failing, restart the panel.</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 6, border: 0, background: "#ededed", color: "#000", fontSize: 14, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
