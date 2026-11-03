export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M9 17V7h4.2a2.8 2.8 0 0 1 .9 5.45L16 17h-1.9l-1.7-4H10.8v4H9Zm1.8-5.6h2.3a1.2 1.2 0 0 0 0-2.4h-2.3v2.4Z"
        fill="var(--bg)"
      />
    </svg>
  );
}
