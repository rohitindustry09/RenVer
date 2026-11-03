import type { CSSProperties } from "react";

interface BlockProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  style?: CSSProperties;
}

/** One grey placeholder block. It shimmers while content loads, and stands still for people who prefer less motion. */
export function Skeleton({ width = "100%", height = 16, circle = false, style }: BlockProps) {
  return <span className={`skeleton${circle ? " circle" : ""}`} style={{ width, height, ...style }} aria-hidden="true" />;
}

/** Wraps placeholders so assistive tech announces one "Loading" instead of many empty shapes. */
export function SkeletonRegion({ label = "Loading", children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 2, widths = ["80%", "55%"] }: { lines?: number; widths?: string[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/** Heading and subtitle of a page. */
export function PageHeadSkeleton() {
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 32 }}>
      <Skeleton height={32} width={220} />
      <Skeleton height={14} width={340} />
    </div>
  );
}

/** One project card, shaped like the real one so nothing jumps when the data arrives. */
export function ProjectCardSkeleton() {
  return (
    <div className="card project-card" aria-hidden="true">
      <div className="top">
        <Skeleton width={40} height={40} circle />
        <div style={{ display: "grid", gap: 8, flex: 1 }}>
          <Skeleton height={16} width="55%" />
          <Skeleton height={12} width="75%" />
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <Skeleton height={14} width="85%" />
        <Skeleton height={12} width="60%" />
      </div>
    </div>
  );
}

export function ProjectGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonRegion label="Loading projects" className="cards">
      {Array.from({ length: count }, (_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  );
}

/** A list of rows inside a card: deployments, domains, backups. */
export function RowsSkeleton({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="card">
      {Array.from({ length: rows }, (_, i) => (
        <div className="row" key={i} aria-hidden="true" style={i === 0 ? { borderTop: 0 } : undefined}>
          <Skeleton width={8} height={8} circle />
          <div className="row-main" style={{ display: "grid", gap: 8 }}>
            <Skeleton height={14} width="40%" />
            <Skeleton height={12} width="65%" />
          </div>
          <Skeleton width={72} height={28} />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A card with a title and a few lines of content. */
export function CardSkeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="card">
      <div className="card-head" aria-hidden="true">
        <Skeleton height={18} width={160} />
      </div>
      <div className="card-pad" aria-hidden="true">
        <SkeletonLines lines={lines} widths={["90%", "70%", "80%"]} />
      </div>
    </SkeletonRegion>
  );
}

/** The Usage and Alerts column on the Overview. */
export function SidePanelSkeleton() {
  return (
    <SkeletonRegion label="Loading summary" className="stack">
      <div className="card" aria-hidden="true">
        <div className="card-head"><Skeleton height={18} width={120} /></div>
        <div className="card-pad" style={{ display: "grid", gap: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "grid", gap: 8 }}>
              <Skeleton height={12} width="50%" />
              <Skeleton height={6} />
            </div>
          ))}
        </div>
      </div>
      <CardSkeleton lines={2} label="Loading alerts" />
    </SkeletonRegion>
  );
}

export function ProjectPageSkeleton() {
  return (
    <SkeletonRegion label="Loading project">
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }} aria-hidden="true">
        <Skeleton width={56} height={56} circle />
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={28} width={240} />
          <Skeleton height={14} width={90} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 12 }} aria-hidden="true">
        {[80, 100, 70].map((w, i) => <Skeleton key={i} height={16} width={w} />)}
      </div>
      <div className="stack" aria-hidden="true">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={2} />
      </div>
    </SkeletonRegion>
  );
}

/** A form: a few labelled fields. */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <SkeletonRegion label="Loading form" className="card">
      <div className="card-head" aria-hidden="true"><Skeleton height={18} width={140} /></div>
      <div className="card-pad stack" aria-hidden="true">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} style={{ display: "grid", gap: 8 }}>
            <Skeleton height={14} width={110} />
            <Skeleton height={40} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Generic page: heading plus a couple of cards. Shown by loading.tsx while a route opens. */
export function PageSkeleton() {
  return (
    <SkeletonRegion label="Loading page">
      <PageHeadSkeleton />
      <div className="stack" aria-hidden="true">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={2} />
      </div>
    </SkeletonRegion>
  );
}
