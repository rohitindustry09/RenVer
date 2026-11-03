import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Nothing to sign in to when no password is set (a local panel).
  if (!process.env.RENVER_ADMIN_PASSWORD) redirect("/");
  // The username is deliberately not filled in or hinted here: the page tells a stranger nothing about the account.
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <LoginForm />
    </main>
  );
}
