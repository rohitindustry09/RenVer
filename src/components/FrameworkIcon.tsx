import { BRAND_LOGOS } from "@/lib/brand-logos";
import { stackLabel, type Stack } from "@/lib/stack";

interface Props {
  stack: Stack;
  size?: number;
  /** Letter shown when the stack has no logo of its own. */
  fallback?: string;
}

/** The official logo of the project's framework, in its brand colour (black logos follow the theme). */
export function FrameworkIcon({ stack, size = 22, fallback }: Props) {
  const logo = BRAND_LOGOS[stack];
  if (!logo) {
    return <span aria-hidden="true" style={{ fontWeight: 600, fontSize: size * 0.7 }}>{(fallback ?? "?").charAt(0)}</span>;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${stackLabel(stack)} logo`}
      fill={logo.color ?? "currentColor"}
      style={{ flexShrink: 0 }}
    >
      <path d={logo.path} />
    </svg>
  );
}
