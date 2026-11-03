# RenVer

A self-hosted place to deploy your apps, like Vercel or Render, on your own machine or server. Upload a zip or import a GitHub repository, pick an address, and RenVer detects the framework, builds it in Docker and puts it online with HTTPS (Caddy).

## Quick start

You need Node.js 22+, Docker, Git and Caddy. The panel's Setup page checks these and can install what is missing.

```bash
npm ci
npm run build
npm start            # http://127.0.0.1:3000 (the next free port if 3000 is taken; it prints the address)
```

For development with hot reload use `npm run dev` (slower: pages compile on first visit).

Running it on a server, starting it at boot, HTTPS and what to check before you rely on it: see [docs/DEPLOY.md](docs/DEPLOY.md).

## What it does

- **Deploy** from a zip or a GitHub repository. Detects Next.js, Vite, React, Vue, Angular, Svelte, Astro, Nuxt, Remix, Express, NestJS, Fastify, plain Node, static HTML, Dockerfile and Shopify apps.
- **Domains:** add as many as you own, prove ownership with a DNS record, and put apps on subdomains or directly on a root domain.
- **Databases:** PostgreSQL, MySQL or MariaDB next to your apps, with generated credentials and one-click linking to a project.
- **Safe to run:** apps are limited in memory and CPU, restarted if they crash, and rolled back by redeploying an older version.
- **Backups:** every backup holds RenVer's settings and the data inside your databases; a full backup also keeps project sources. Restore brings everything back paused.
- **Operations:** pause, resume and restart apps, live logs and usage, alerts to Discord, Slack or Telegram, and auto-deploy on every GitHub push.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `RENVER_PORT` | `3000` | Port the panel starts on; the next free one is used if it is taken |
| `RENVER_MODE` | `local` | `production` makes the panel refuse to run without a password and turns on HTTPS-only headers |
| `RENVER_ADMIN_PASSWORD` | (none) | Password for the panel (any username). Required in production |
| `RENVER_BASE_DOMAIN` | `localhost` | The first domain, seeded on first start. More are added in the panel |
| `RENVER_PANEL_HOST` | `panel.localhost` locally | Address the panel itself is served on through Caddy |
| `RENVER_DATA_DIR` | `./data` | Where the database, encryption key, sources, logs and backups live |
| `RENVER_APP_MEMORY`, `RENVER_APP_CPUS` | `512m`, `1` | Starting limits per app (editable in Settings, and per project) |
| `RENVER_HOST_PORT_START` | `4001` | First local port handed to an app |
| `RENVER_BACKUP_PASSPHRASE` | (none) | Encrypts every new backup. Strongly recommended |
| `RENVER_ALLOWED_IPS` | (none) | Only these addresses may reach the panel |
| `RENVER_SECRET` | (none) | Optional encryption key (base64) instead of `data/secret.key` |

Copy [.env.example](.env.example) to `.env` to set these (every line is documented there).

## Security

Read [docs/SECURITY.md](docs/SECURITY.md) before putting real apps on it: it explains what is protected, what to switch on (backup encryption, an allowed-addresses list, private repo, disk encryption) and what no software can promise.

- The panel can run code, so in production it needs `RENVER_ADMIN_PASSWORD`. Ten wrong passwords from one address lock that address out for 15 minutes.
- Environment variables and database passwords are encrypted with a key in `data/secret.key`. Keep that file (it is inside every backup) and never share it.
- Every page is sent with headers that stop it being shown inside another site's frame.
- `GET /api/health` answers `{ "ok": true }` for uptime monitors without a login. GitHub's webhook is checked by signature instead of a login.

## Development

```bash
npm test             # unit and integration tests
npx tsc --noEmit     # type check
```

The code keeps logic in small pure modules under `src/lib` (each with a test) and keeps routes and components thin.
