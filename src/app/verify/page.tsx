import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { configuredTotpSecret } from "@/lib/two-factor";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Two-factor code" };
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  // Nothing to enter when the extra step is off.
  if (!configuredTotpSecret()) redirect("/");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <VerifyForm />
    </main>
  );
}
