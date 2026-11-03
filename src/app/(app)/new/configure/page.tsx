import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/Skeleton";
import { ConfigureForm } from "@/components/new/ConfigureForm";

export const metadata: Metadata = { title: "Configure Project" };

export default function ConfigurePage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ConfigureForm />
    </Suspense>
  );
}
