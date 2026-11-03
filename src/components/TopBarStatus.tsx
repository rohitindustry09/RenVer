"use client";

import Link from "next/link";
import { missingRequirements, useSystem } from "@/hooks/useSystem";

/** Shows a link to Setup in the header when a required tool is missing. */
export function TopBarStatus() {
  const { data } = useSystem();
  const missing = missingRequirements(data);
  if (missing.length === 0) return null;
  return (
    <Link href="/setup" className="badge warn" title={missing.map((c) => c.label).join(", ")}>
      <span className="dot warn" /> Setup incomplete
    </Link>
  );
}
