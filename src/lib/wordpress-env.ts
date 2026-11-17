/** The pieces that make a WordPress project: its Dockerfile and the settings it starts with. Pure. */

export const WORDPRESS_IMAGE = "wordpress:php8.3-apache";
/** The port Apache listens on inside the container. */
export const WORDPRESS_PORT = 80;
/** Everything WordPress keeps (core files, themes, plugins, uploads, wp-config.php) lives here, so it is a saved folder. */
export const WORDPRESS_DATA_DIR = "/var/www/html";

/** The Dockerfile RenVer builds for a WordPress site. */
export function wordpressDockerfile(): string {
  return `FROM ${WORDPRESS_IMAGE}

# Bigger uploads and more memory than PHP's defaults, which suit a real website better.
RUN { \\
      echo 'upload_max_filesize = 64M'; \\
      echo 'post_max_size = 64M'; \\
      echo 'memory_limit = 256M'; \\
      echo 'max_execution_time = 120'; \\
    } > /usr/local/etc/php/conf.d/renver.ini

EXPOSE ${WORDPRESS_PORT}
`;
}

/**
 * Put into wp-config.php (once, when WordPress first starts). The website's address follows the address the visitor used,
 * as long as it is one of this project's own (RENVER_HOSTS, which RenVer fills in at every deploy). So changing a project's
 * address needs no change inside WordPress, and a made-up Host header cannot point the site somewhere else.
 */
export const WORDPRESS_CONFIG_EXTRA =
  "$rv_hosts = array_filter(explode(',', (string) getenv('RENVER_HOSTS'))); " +
  "$rv_host = $_SERVER['HTTP_HOST'] ?? ''; " +
  "if (!in_array($rv_host, $rv_hosts, true)) { $rv_host = $rv_hosts[0] ?? $rv_host; } " +
  "$rv_scheme = (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http'; " +
  "define('WP_HOME', $rv_scheme . '://' . $rv_host); " +
  "define('WP_SITEURL', WP_HOME);";

/** The settings a WordPress project starts with, from its database's connection details. */
export function wordpressEnv(db: { host: string; port: number; database: string; username: string; password: string; connectionUrl: string }): Record<string, string> {
  return {
    WORDPRESS_DB_HOST: `${db.host}:${db.port}`,
    WORDPRESS_DB_NAME: db.database,
    WORDPRESS_DB_USER: db.username,
    WORDPRESS_DB_PASSWORD: db.password,
    WORDPRESS_CONFIG_EXTRA: WORDPRESS_CONFIG_EXTRA,
    // Also what links the database to this project in RenVer (the "Connected to" badge, and the network the app joins).
    DATABASE_URL: db.connectionUrl,
  };
}

/** Settings RenVer adds at every deploy for a project made from a template. Nothing is changed for other projects. */
export function templateEnv(env: Record<string, string>, template: string | undefined, hosts: readonly string[]): Record<string, string> {
  return template === "wordpress" ? { ...env, RENVER_HOSTS: hosts.join(",") } : env;
}

/**
 * The official WordPress image starts as root, copies WordPress into the saved folder, then fixes owners and permissions,
 * and Apache later signals its workers. Without these three it cannot finish copying and never answers.
 * Everything else stays dropped. Nothing is added for other projects.
 */
export const WORDPRESS_CAPABILITIES = ["DAC_OVERRIDE", "FOWNER", "KILL"] as const;

export function templateCapabilities(template: string | undefined): readonly string[] {
  return template === "wordpress" ? WORDPRESS_CAPABILITIES : [];
}
