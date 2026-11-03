const TITLES: [prefix: string, title: string][] = [
  ["/deployments", "Deployments"],
  ["/domains", "Domains"],
  ["/databases", "Databases"],
  ["/settings", "Settings"],
  ["/projects", "Project"],
  ["/new", "New Project"],
  ["/setup", "Setup"],
];

/** The heading shown in the top bar for a page. */
export function pageTitle(pathname: string): string {
  const path = pathname.replace(/(.)\/+$/, "$1");
  if (path === "/") return "All Projects";
  const match = TITLES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : "RenVer";
}
