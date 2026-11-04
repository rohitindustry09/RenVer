interface Props {
  size?: number;
  /** Plays the logo animation (public/brand/logo-animated.gif). People who ask their device for less motion get the still logo. */
  animated?: boolean;
}

/** The RenVer "R" mark: sidebar, sign-in page and setup page. The files live in public/brand (the tab icon is set in layout.tsx). */
export function Logo({ size = 24, animated = false }: Props) {
  const style = { display: "block", borderRadius: size * 0.22 } as const;
  /* eslint-disable @next/next/no-img-element -- small fixed logos; no resizing service needed */
  if (!animated) return <img src="/brand/logo.png" width={size} height={size} alt="" aria-hidden="true" style={style} />;
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet="/brand/logo.png" />
      <img src="/brand/logo-animated.gif" width={size} height={size} alt="" aria-hidden="true" style={style} />
    </picture>
  );
}
