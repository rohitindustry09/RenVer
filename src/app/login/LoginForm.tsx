"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { safeNext } from "@/lib/login";

function Form() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json()) as { success: boolean; error?: string; data?: { twoFactor: boolean } };
      if (!body.success) throw new Error(body.error ?? "Could not sign in.");
      // A full page load, so the new cookie is used from the first request.
      window.location.assign(body.data?.twoFactor ? "/verify" : safeNext(params.get("next")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setPassword("");
      setIsBusy(false);
    }
  };

  return (
    <form className="card" style={{ width: "min(420px, 100%)" }} onSubmit={submit} aria-labelledby="login-heading">
      <div className="card-head" style={{ display: "grid", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Logo size={28} />
          <strong style={{ fontSize: 18 }}>RenVer</strong>
        </span>
        <div>
          <h1 className="h3" id="login-heading">Sign in</h1>
          <p className="sub">Enter your username and password to open the panel.</p>
        </div>
      </div>
      <div className="card-pad stack-sm">
        <label className="field">
          <span className="label">Username</span>
          <input
            className="input"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            aria-describedby={error ? "login-error" : undefined}
          />
        </label>
        {error && <p className="notice error" id="login-error" role="alert">{error}</p>}
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="btn primary" disabled={!username.trim() || !password || isBusy}>
          {isBusy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}

/** The sign-in form: username and password, then (if it is turned on) the code page. */
export function LoginForm() {
  // useSearchParams needs a Suspense boundary in a statically built page.
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
