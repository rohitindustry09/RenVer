import { FormSkeleton, PageHeadSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeadSkeleton />
      <div className="split">
        <FormSkeleton fields={4} />
        <FormSkeleton fields={3} />
      </div>
    </>
  );
}
