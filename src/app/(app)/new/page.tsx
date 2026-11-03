import type { Metadata } from "next";
import Link from "next/link";
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
      <ImportCards />
    </>
  );
}
