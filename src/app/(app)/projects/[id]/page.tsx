import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectPageSkeleton } from "@/components/Skeleton";
import { ProjectView } from "@/components/project/ProjectView";

export const metadata: Metadata = { title: "Project" };

export default function ProjectPage() {
  return (
    <Suspense fallback={<ProjectPageSkeleton />}>
      <ProjectView />
    </Suspense>
  );
}
