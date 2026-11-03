"use client";

import { useState, type FormEvent } from "react";

const CODE_LENGTH = 6;
const RECOVERY_MIN_LENGTH = 10;
const RECOVERY_MAX_LENGTH = 11;

/** The code step of signing in: the six digits from the authenticator app. */
export function VerifyForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { success: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? "Could not check the code.");
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the code.");
      setCode("");
      setIsBusy(false);
    }
  };

  return (
    <form className="card" style={{ width: "min(420px, 100%)" }} onSubmit={submit} aria-labelledby="verify-heading">
      <div className="card-head">
        <h1 className="h3" id="verify-heading">Two-factor code</h1>
        <p className="sub">{isRecovery ? "Enter one of your one-time recovery codes. Each works once." : "Open your authenticator app and enter the 6-digit code for RenVer."}</p>
      </div>
      <div className="card-pad stack-sm">
        <label className="field">
          <span className="label">Code</span>
          <input
            className="input mono"
            value={code}
            onChange={(e) =>
              setCode(
                isRecovery
                  ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, RECOVERY_MAX_LENGTH)
                  : e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH),
              )
            }
            inputMode={isRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            placeholder={isRecovery ? "XXXXX-XXXXX" : "123456"}
            aria-describedby={error ? "verify-error" : undefined}
          />
        </label>
        {error && <p className="notice error" id="verify-error" role="alert">{error}</p>}
        <button type="button" className="btn sm" onClick={() => { setIsRecovery((v) => !v); setCode(""); setError(null); }}>
          {isRecovery ? "Use the app code instead" : "Use a recovery code"}
        </button>
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="btn primary" disabled={(isRecovery ? code.replace(/-/g, "").length < RECOVERY_MIN_LENGTH : code.length !== CODE_LENGTH) || isBusy}>
          {isBusy ? "Checking…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
