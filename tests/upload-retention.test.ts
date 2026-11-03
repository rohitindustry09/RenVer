import { describe, expect, it } from "vitest";
import { selectUploadsToDelete } from "@/lib/upload-retention";

const HOUR = 3_600_000;
const disk = (id: string, ageHours: number) => ({ id, ageMs: ageHours * HOUR });
const deploy = (projectId: string, uploadId: string | null) => ({ projectId, uploadId });

const rules = { keepPerProject: 2, orphanMaxAgeMs: 24 * HOUR };

describe("selectUploadsToDelete", () => {
  it("keeps the newest few sources of each project and deletes older ones", () => {
    const deploys = [deploy("p", "u3"), deploy("p", "u2"), deploy("p", "u1")]; // newest first
    const onDisk = [disk("u1", 90), disk("u2", 50), disk("u3", 1)];
    expect(selectUploadsToDelete({ onDisk, deploys, ...rules })).toEqual(["u1"]);
  });

  it("counts each project separately", () => {
    const deploys = [deploy("a", "a2"), deploy("b", "b2"), deploy("a", "a1"), deploy("b", "b1")];
    const onDisk = [disk("a1", 10), disk("a2", 5), disk("b1", 10), disk("b2", 5)];
    expect(selectUploadsToDelete({ onDisk, deploys, ...rules })).toEqual([]);
  });

  it("never deletes a source that a kept deploy still uses, even if an older deploy shares it", () => {
    const deploys = [deploy("p", "u2"), deploy("p", "u1"), deploy("p", "u1")];
    const onDisk = [disk("u1", 90), disk("u2", 1)];
    expect(selectUploadsToDelete({ onDisk, deploys, ...rules })).toEqual([]);
  });

  it("deletes an import that was never deployed, but only after it is old enough to be abandoned", () => {
    const onDisk = [disk("fresh", 2), disk("abandoned", 30)];
    expect(selectUploadsToDelete({ onDisk, deploys: [], ...rules })).toEqual(["abandoned"]);
  });

  it("ignores deploys that have no source", () => {
    const deploys = [deploy("p", null), deploy("p", "u1")];
    expect(selectUploadsToDelete({ onDisk: [disk("u1", 90)], deploys, ...rules })).toEqual([]);
  });

  it("deletes the source of a project that no longer has any deploys once it is old", () => {
    expect(selectUploadsToDelete({ onDisk: [disk("gone", 100)], deploys: [], ...rules })).toEqual(["gone"]);
  });
});
