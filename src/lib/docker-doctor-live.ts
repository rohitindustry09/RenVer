import { spawn } from "node:child_process";
import { resolveBinary } from "./binaries";
import { diagnoseDocker, gatherDockerFacts, type DockerDiagnosis } from "./docker-doctor";

const COMMAND_TIMEOUT_MS = 8000;
const TIMED_OUT = 124;

/** Runs one quick command and returns its exit code and what it printed. It never throws and never runs longer than a few seconds. */
function run(command: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const program = command === "docker" ? resolveBinary("docker") : command;
    const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    const collect = (chunk: Buffer) => void (out += chunk.toString("utf8"));
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () => {
      clearTimeout(timer);
      done({ code: 127, out: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: isTimedOut ? TIMED_OUT : (code ?? 1), out });
    });
  });
}

/** Looks at this machine now and says why Docker does or does not answer, and what to do. */
export async function diagnoseDockerNow(): Promise<DockerDiagnosis> {
  return diagnoseDocker(await gatherDockerFacts(process.platform, run));
}
