import type { DetectionResult } from "./detect";

/** Editable, all-text version of the build settings shown in the form. */
export interface ConfigDraft {
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  port: string;
}

export function draftFromDetection(detection: DetectionResult): ConfigDraft {
  return {
    installCommand: detection.installCommand ?? "",
    buildCommand: detection.buildCommand ?? "",
    startCommand: detection.startCommand ?? "",
    outputDir: detection.outputDir ?? "",
    port: String(detection.port),
  };
}

export interface ConfigPayload {
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  port: number;
}

/** The port is sent as a number; a non-numeric value becomes NaN so the server rejects it clearly. */
export function draftToPayload(draft: ConfigDraft): ConfigPayload {
  return { ...draft, port: draft.port.trim() === "" ? Number.NaN : Number(draft.port) };
}
