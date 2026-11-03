export interface DnsAssessment {
  status: "ok" | "warn" | "fail";
  message: string;
}

interface DnsInput {
  baseDomain: string;
  mode: "local" | "production";
  /** What the checked name resolved to. */
  addresses: string[];
  /** Addresses this server is known by: its interfaces plus any IP the admin configured. */
  localAddresses: string[];
  /** The record being checked, for messages. Defaults to the wildcard of the base domain. */
  recordName?: string;
}

const isLoopback = (address: string): boolean => address.startsWith("127.") || address === "::1";
const isLocalhostDomain = (domain: string): boolean => domain === "localhost" || domain.endsWith(".localhost");

export function assessDns({ baseDomain, mode, addresses, localAddresses, recordName }: DnsInput): DnsAssessment {
  const record = recordName ?? `*.${baseDomain}`;

  if (addresses.length === 0 && mode === "local" && isLocalhostDomain(baseDomain)) {
    return {
      status: "ok",
      message: "Browsers resolve .localhost names to this computer on their own, so no DNS record is needed.",
    };
  }
  if (addresses.length === 0) {
    return {
      status: "fail",
      message: `Nothing resolves yet. Add an A record for ${record} pointing at this server's IP address, then check again.`,
    };
  }
  if (addresses.every(isLoopback)) {
    return mode === "local"
      ? { status: "ok", message: "This name resolves to this computer, which is what local mode needs." }
      : { status: "warn", message: `${record} points at a loopback address, so it only works on this machine.` };
  }
  if (addresses.some((a) => localAddresses.includes(a))) {
    return { status: "ok", message: `${record} points at this machine.` };
  }
  return {
    status: "warn",
    message: `${record} resolves to ${addresses.join(", ")}, which is not an address of this machine. That is fine if this server sits behind a public IP or proxy; otherwise update the A record, or set the server IP above.`,
  };
}
