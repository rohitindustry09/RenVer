"use client";

import type { ConfigDraft } from "@/lib/config-draft";
import type { DetectionResult } from "@/lib/detect";

interface Props {
  detection: DetectionResult;
  draft: ConfigDraft;
  onChange: (draft: ConfigDraft) => void;
}

interface TextFieldProps {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}

function TextField({ label, hint, value, placeholder, type = "text", onChange }: TextFieldProps) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input mono"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function BuildSettings({ detection, draft, onChange }: Props) {
  const set = (key: keyof ConfigDraft) => (value: string) => onChange({ ...draft, [key]: value });
  const isDockerfile = detection.framework === "dockerfile";
  const isStatic = detection.kind === "static";

  return (
    <div className="stack">
      {isDockerfile && (
        <p className="notice">A Dockerfile was found, so it is used as-is. Only the port below applies.</p>
      )}
      {!isDockerfile && (
        <>
          <TextField label="Install command" value={draft.installCommand} placeholder="npm ci" onChange={set("installCommand")} />
          <TextField label="Build command" value={draft.buildCommand} placeholder="none" onChange={set("buildCommand")} />
          {isStatic ? (
            <TextField
              label="Output directory"
              value={draft.outputDir}
              placeholder="dist"
              hint="Served as a static site."
              onChange={set("outputDir")}
            />
          ) : (
            <TextField label="Start command" value={draft.startCommand} placeholder="npm run start" onChange={set("startCommand")} />
          )}
        </>
      )}
      {!isStatic && (
        <TextField
          label="Port"
          type="number"
          value={draft.port}
          hint="The port your app listens on inside its container."
          onChange={set("port")}
        />
      )}
    </div>
  );
}
