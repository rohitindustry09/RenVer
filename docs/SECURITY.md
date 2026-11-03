# Keeping your data and source code safe

RenVer holds things worth stealing: an encryption key, your apps' secrets, your databases and the source code of everything you deploy. This page explains what protects what, what you should switch on, and what no software can promise.

## Where the sensitive things are

Everything lives in the `data/` folder (or `RENVER_DATA_DIR`):

| What | Where | Protected by |
|---|---|---|
| Encryption key | `secret.key` | File permissions (owner only). Encrypted inside backups only if you set a backup passphrase |
| Environment variables, database passwords, webhook secrets, notification address | `renver.db` | Encrypted with the key above |
| Project source code | `uploads/` | Folder permissions only (plain files, because builds need them) |
| Database contents | the database containers, and `db-dumps/` | Folder permissions only |
| Backups (key + database + sources + database contents) | `backups/` | **Passphrase encryption, if you set `RENVER_BACKUP_PASSPHRASE`** |

## Switch these on

**1. Encrypt backups.** Set `RENVER_BACKUP_PASSPHRASE` (see `.env.example`) and restart. Every new backup is then AES-256 encrypted and useless without the passphrase. Without it, a backup file contains your key and anything inside it can be read. Keep the passphrase in a password manager, **not on the server**: you need it to restore, and it cannot be recovered. Old backups stay as they were; make a fresh one and delete the old ones.

**2. Limit who can reach the panel.** Set `RENVER_ALLOWED_IPS` to your own addresses. Everyone else gets "not allowed" before they can even try a password. For the strongest setup, put the panel behind a VPN (for example Tailscale or WireGuard) and allow only the VPN range. A mistake in the list locks others out; it never opens the panel.

**3. Use a strong panel password.** `RENVER_ADMIN_PASSWORD` should be long and random. Ten wrong tries lock an address out for 15 minutes.

**4. Keep RenVer's own source private.** Make the GitHub repository private and let the server pull with a read-only deploy key (GitHub → repo → Settings → Deploy keys). Source that was public even briefly may already have been copied; assume it was.

**5. Encrypt the disk.** This protects against a stolen laptop or a copied VPS disk. On a laptop use BitLocker (Windows) or FileVault; on a VPS choose encrypted storage if your provider offers it, or use LUKS. RenVer's own encryption cannot replace it for `uploads/` and `db-dumps/`.

**6. Harden the server** (VPS):
- Log in with SSH keys only (`PasswordAuthentication no`), and do not run RenVer as root.
- Open only ports 22, 80 and 443 (`ufw allow 22,80,443/tcp && ufw enable`). Docker published ports bind to `127.0.0.1`, so apps are only reachable through Caddy.
- Install `fail2ban` and turn on automatic security updates (`unattended-upgrades`).
- Back up off the server: copy encrypted backups somewhere else (another machine or storage account).

## Source code of the apps you deploy

- **Never served by RenVer.** There is no page or API that returns an app's source. The only ways it leaves are a backup file (protected by the passphrase) and the server's disk (protected by the disk encryption and permissions above).
- **Static sites without a build step** used to expose every file in the uploaded folder. They now refuse hidden files (`.env`, `.git`), source maps, `Dockerfile`, `package.json` and similar.
- **Code that runs in the visitor's browser is public by nature.** A website's JavaScript and CSS are downloaded by every visitor and can be read. Minifying makes it harder to read, not secret. Keep anything private (keys, business logic) in server code, never in the browser bundle.
- **Source maps** rebuild your original code from the browser bundle. Leave them off in production builds (Vite and Next.js do not publish them by default).
- **Secrets inside the zip:** do not upload a real `.env` file inside a project. Add variables on the project's Settings page instead; those are stored encrypted.

## What this cannot protect against

Encryption protects data **that is not in use**: a copied backup, a stolen disk. If an attacker takes full control of the running server, they can read what the server can read, including the key in memory. The defence there is to stop them getting in (VPN or allowed addresses, SSH keys, firewall, updates, a strong password) and to keep an offsite, encrypted backup so you can rebuild. Nothing in a web app can hide code from the machine that runs it.

## If you think something leaked

1. Change the panel password and restart RenVer.
2. Treat every stored secret as exposed: rotate API keys, database passwords and webhook secrets, and re-enter them on the projects.
3. If a backup or the `data/` folder leaked, also move to a new `secret.key` (restore on a fresh install after changing the secrets) and set a backup passphrase.
4. Delete old backups that were not encrypted.
