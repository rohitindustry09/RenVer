import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { SetupChecklist } from "@/components/SetupChecklist";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <>
      <header className="header">
        <div className="container">
          <div className="topbar">
            <span className="brand">
              <Logo />
              <span>RenVer</span>
            </span>
          </div>
        </div>
      </header>
      <main className="centered">
        <div className="stack">
          <div className="stack-sm">
            <span className="badge" style={{ width: "fit-content" }}>Step 1 of 2</span>
            <h1 className="h1">Set up RenVer</h1>
            <p className="sub">
              Install what is missing on this machine first. After that you can import a project and put it on its own
              subdomain.
            </p>
          </div>
          <SetupChecklist />
        </div>
      </main>
    </>
  );
}
