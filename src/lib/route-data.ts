/** Which API requests each page makes when it opens. Used to warm the cache when a menu item is hovered. */

const STATIC_ROUTES: Record<string, string[]> = {
  "/": ["/api/projects", "/api/usage", "/api/alerts", "/api/deployments?limit=6"],
  "/deployments": ["/api/deployments"],
  "/domains": ["/api/domains"],
  "/databases": ["/api/databases", "/api/projects"],
  "/settings": ["/api/settings", "/api/backups", "/api/backups/schedule"],
};

const PROJECT_ROUTE = /^\/projects\/([A-Za-z0-9-]+)$/;

export function dataUrlsForRoute(href: string): string[] {
  const path = (href.split(/[?#]/)[0] ?? "").replace(/(.)\/+$/, "$1");
  const fixed = STATIC_ROUTES[path];
  if (fixed) return [...fixed];

  const project = PROJECT_ROUTE.exec(path);
  return project ? [`/api/projects/${project[1]}`] : [];
}
