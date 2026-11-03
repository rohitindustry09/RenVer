"use client";

import Link from "next/link";
import type { HostCheckResult } from "@/hooks/useHostCheck";
import { Select } from "../Select";
import { isUsable, type DomainItem } from "./types";

interface Props {
  domains: DomainItem[];
  domainId: string;
  label: string;
  /** The availability check for this domain + label. The parent runs it, so it also controls its submit button. */
  check: HostCheckResult;
  onDomainChange: (domainId: string) => void;
  onLabelChange: (label: string) => void;
  idPrefix?: string;
}

/** "label" + "." + domain, where an empty label means the root domain itself. */
export function HostPicker({ domains, domainId, label, check, onDomainChange, onLabelChange, idPrefix = "host" }: Props) {
  const usable = domains.filter(isUsable);

  if (usable.length === 0) {
    return (
      <p className="notice warn">
        You need a verified domain first. <Link href="/domains" className="mono">Add one on the Domains page</Link>.
      </p>
    );
  }

  const dot = check.state === "available" ? "ok" : check.state === "checking" ? "building pulse" : "fail";
  return (
    <div>
      <div className="input-group">
        <input
          className="input mono"
          value={label}
          placeholder="subdomain, or leave empty for the root domain"
          onChange={(e) => onLabelChange(e.target.value.toLowerCase())}
          aria-label="Subdomain"
          aria-describedby={`${idPrefix}-status`}
          autoComplete="off"
          spellCheck={false}
        />
        <Select
          value={domainId}
          onChange={onDomainChange}
          ariaLabel="Domain"
          style={{ width: "auto", minWidth: 160, maxWidth: "50%", borderRadius: "0 6px 6px 0", borderLeft: 0 }}
          options={domains.map((d) => ({
            value: d.id,
            label: `${label ? "." : ""}${d.name}`,
            hint: isUsable(d) ? undefined : "Verify this domain first",
            isDisabled: !isUsable(d),
          }))}
        />
      </div>
      <span id={`${idPrefix}-status`}>
        {check.state !== "idle" && (
          <span className="check-hint" role="status">
            <span className={`dot ${dot}`} aria-hidden="true" />
            {check.state === "available" && <>Available: <span className="mono">{check.host}</span></>}
            {check.state === "checking" && "Checking…"}
            {check.state === "unavailable" && (check.message ?? "Unavailable")}
          </span>
        )}
      </span>
      {!label && check.state === "available" && (
        <span className="hint" style={{ display: "block", marginTop: 4 }}>
          The app will live directly on the root domain.
        </span>
      )}
    </div>
  );
}
