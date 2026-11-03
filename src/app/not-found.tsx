import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="empty" style={{ maxWidth: 480 }}>
        <h1 className="h3">Page not found</h1>
        <p className="sub">That address does not exist in RenVer. It may have been moved, or the project may have been deleted.</p>
        <Link href="/" className="btn primary">Back to Projects</Link>
      </div>
    </main>
  );
}
