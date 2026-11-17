import type { Metadata } from "next";
import Link from "next/link";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { ImportCards } from "@/components/new/ImportCards";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  return (
    <>
      <Link href="/" className="back-link">← Overview</Link>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">Let’s build something new</h1>
          <p className="sub">Import a project to put it on its own subdomain.</p>
        </div>
      </div>
      <Link href="/new/wordpress" className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <FrameworkIcon stack="wordpress" size={36} />
        <span className="stack-sm">
          <strong>Create a WordPress website</strong>
          <span className="sub">Pick a title, an address and an admin login. RenVer installs everything.</span>
        </span>
      </Link>
      <ImportCards />
    </>
  );
}
