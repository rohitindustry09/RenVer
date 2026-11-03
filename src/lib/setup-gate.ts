export const SETUP_COOKIE = "renver_setup";

/** The first visit to the dashboard goes through Setup (installing requirements) first. */
export function shouldRedirectToSetup(pathname: string, hasSetupCookie: boolean): boolean {
  return pathname === "/" && !hasSetupCookie;
}
