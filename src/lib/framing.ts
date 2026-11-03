interface HeaderReader {
  get(name: string): string | null;
}

/** Whether a site lets other pages show it inside a frame, judging by the headers it sent. */
export function allowsFraming(headers: HeaderReader): boolean {
  if (headers.get("x-frame-options")) return false;
  const csp = headers.get("content-security-policy") ?? "";
  const rule = csp.split(";").map((d) => d.trim()).find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  if (!rule) return true;
  return rule.split(/\s+/).slice(1).includes("*");
}
