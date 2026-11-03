import type { Metadata } from "next";

export const metadata: Metadata = { title: "Deployments" };

export default function DeploymentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
