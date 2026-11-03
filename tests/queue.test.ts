import { describe, expect, it } from "vitest";
import { enqueue } from "@/lib/queue";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enqueue", () => {
  it("runs jobs strictly one at a time, in order", async () => {
    const events: string[] = [];
    const job = (name: string, ms: number) => async () => {
      events.push(`start ${name}`);
      await tick(ms);
      events.push(`end ${name}`);
    };
    await Promise.all([enqueue(job("a", 30)), enqueue(job("b", 5))]);
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("keeps processing after a job throws", async () => {
    let ran = false;
    await enqueue(async () => {
      throw new Error("boom");
    });
    await enqueue(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
