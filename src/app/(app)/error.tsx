"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown inside the app when a page crashes, instead of a blank screen. The rest of the app keeps working. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="empty" role="alert">
      <h1 className="h3">Something went wrong on this page</h1>
      <p className="sub">
        It is not you. Try again, and if it keeps happening, check that Docker is running and look at the panel&apos;s output for the cause.
        {error.digest && <> Reference: <span className="mono">{error.digest}</span></>}
      </p>
      <div className="toolbar">
        <button type="button" className="btn primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn">Back to Projects</Link>
      </div>
    </div>
  );
}
