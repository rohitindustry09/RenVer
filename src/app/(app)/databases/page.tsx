"use client";

import { useState } from "react";
import { CreateDatabaseForm } from "@/components/databases/CreateDatabaseForm";
import { DatabaseCard } from "@/components/databases/DatabaseCard";
import { RowsSkeleton } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { useProjects } from "@/hooks/useProjects";
import type { DatabaseListItem } from "@/lib/api";

const REFRESH_MS = 3000;

export default function DatabasesPage() {
  const { data, error, reload } = useFetch<DatabaseListItem[]>("/api/databases", REFRESH_MS);
  const { projects } = useProjects();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">Databases</h1>
          <p className="sub">PostgreSQL, MySQL or MariaDB next to your apps, with credentials generated for you.</p>
        </div>
        {!isCreating && (
          <button type="button" className="btn primary" onClick={() => setIsCreating(true)}>Create database</button>
        )}
      </div>

      <div className="stack">
        {isCreating && (
          <CreateDatabaseForm
            onCancel={() => setIsCreating(false)}
            onCreated={() => {
              setIsCreating(false);
              void reload();
            }}
          />
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {!data && !error && <RowsSkeleton label="Loading databases" />}
        {data?.length === 0 && !isCreating && (
          <div className="empty">
            <h2 className="h3">No databases yet</h2>
            <p className="sub">Create one, then add its connection string to a project with one click.</p>
            <button type="button" className="btn primary" onClick={() => setIsCreating(true)}>Create database</button>
          </div>
        )}
        {data?.map((database) => (
          <DatabaseCard key={database.id} database={database} projects={projects ?? []} onChanged={reload} />
        ))}
      </div>
    </>
  );
}
