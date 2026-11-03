import os from "node:os";
import { fail, ok } from "@/lib/api";
import { listProjects } from "@/lib/db";
import { dockerUpdateLimits } from "@/lib/docker";
import { effectiveLimits, validateLimits } from "@/lib/limits";
import { getLimits, saveLimits } from "@/lib/runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saves the resource limits. New deploys use them straight away; running apps too when asked. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const checked = validateLimits(
      {
        memory: String(body.memory ?? ""),
        cpus: String(body.cpus ?? ""),
        hostPortStart: String(body.hostPortStart ?? ""),
      },
      os.availableParallelism(),
    );
    if (!checked.ok) return fail(Object.values(checked.errors).join(" "), 400);

    saveLimits(checked.value);

    const applied: string[] = [];
    const failed: string[] = [];
    if (body.applyToRunning === true) {
      const targets = listProjects().filter((p) => p.status === "running" && p.container);
      for (const project of targets) {
        try {
          const effective = effectiveLimits(checked.value, project.config.limits);
          await dockerUpdateLimits(project.container!, effective.memory, effective.cpus);
          applied.push(project.name);
        } catch {
          failed.push(project.name);
        }
      }
    }
    return ok({ limits: getLimits(), applied, failed });
  } catch (error) {
    return fail(error, 500);
  }
}
