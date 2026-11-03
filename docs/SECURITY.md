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

**3a. Turn on two-factor login.** A stolen or guessed password is then not enough: after it, the panel asks for the 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator…).

1. On the server run `npm run totp`. It draws a **QR code** in the terminal and prints a setup key and a line `RENVER_TOTP_SECRET=…`.
2. In the authenticator app add an account and **scan the QR code** (or choose "enter a setup key" and type the key if you cannot scan it).
3. Put the `RENVER_TOTP_SECRET=…` line in the server's settings (`.env` in the project folder) and restart RenVer.

Already have the key in `.env` and need to add it to a new phone? Run `npm run totp -- --show`: it draws the QR code for the key that is already set, without making a new one. The QR code is drawn in your own terminal and never goes through a website, so nothing leaves your machine. Treat it like the key itself: do not screenshot or share it.

From then on every browser must enter a code once every 12 hours (the "Lock now" button on Settings forgets it sooner). Codes cannot be reused, and eight wrong codes lock that address out for ten minutes. Because the secret lives in the server's settings and not in `data/`, a leaked backup does not contain it. Keep a copy of the setup key in a password manager: if you lose both the app and the key, remove the line from the settings to switch the step off and run `npm run totp` again. If the secret is written wrongly, the panel shuts instead of silently skipping the step.

**3b. Use a strong panel password.** `RENVER_ADMIN_PASSWORD` should be long and random. RenVer has its own **sign-in page** (username and password; the username is `admin`, or whatever `RENVER_ADMIN_USER` says) instead of the browser's pop-up, so password managers can fill it in. Signing in lasts 24 hours; **Sign out** in the sidebar ends it. Ten wrong tries lock an address out for 15 minutes. Scripts can still send the username and password as a normal `Authorization: Basic` header.

**4. Keep RenVer's own source private.** Make the GitHub repository private and let the server pull with a read-only deploy key (GitHub → repo → Settings → Deploy keys). Source that was public even briefly may already have been copied; assume it was.

**5. Encrypt the disk.** This protects against a stolen laptop or a copied VPS disk. On a laptop use BitLocker (Windows) or FileVault; on a VPS choose encrypted storage if your provider offers it, or use LUKS. RenVer's own encryption cannot replace it for `uploads/` and `db-dumps/`.

**6. Harden the server** (VPS):
- Log in with SSH keys only (`PasswordAuthentication no`), and do not run RenVer as root.
- Open only ports 22, 80 and 443 (`ufw allow 22,80,443/tcp && ufw enable`). Docker published ports bind to `127.0.0.1`, so apps are only reachable through Caddy.
- Install `fail2ban` and turn on automatic security updates (`unattended-upgrades`).
- Back up off the server: copy encrypted backups somewhere else (another machine or storage account).

## Seeing what happened (activity log)

Settings → Activity lists what was changed through the panel: deploys, deletes, pauses, variable changes, backups made, restored or downloaded, domain and database changes, settings, sign-ins with a two-factor code and wrong codes, and deploys triggered by GitHub. Each entry has the time, what, on what, and the address it came from. **Passwords and variable values are never recorded** (only the names of variables that changed). The newest 5,000 entries are kept, and they are inside backups.

Only requests that **succeeded** are recorded, so the log never says something happened that did not. Wrong *passwords* are not in the list (they are stopped before the panel's code runs); they are printed to the server's output (`journalctl -u renver`) with the address. Check the log now and then for things you did not do, especially a backup download or a restore.

The address is the one Caddy reports. Behind other proxies, or when someone is on the server itself, it shows `local`.

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

## Hardening added later

- **Weak or reused secrets** are flagged in Settings and on the Overview (a short or common panel password, one that contains the username, or a backup passphrase equal to the password). The secrets themselves are never shown.
- **Audit log flooding:** repeated failed sign-ins from one address are recorded once a minute, and failures have their own cap (500), so guessing cannot push real history out.
- **Sign out everywhere** (Settings → Security) invalidates every sign-in cookie on every browser at once. The panel's middleware runs on the Node.js runtime so it can check this.
- **Recovery codes** for two-factor login: `npm run totp -- --recovery` lists 8 one-time codes made from your key. Enter one on the code page ("Use a recovery code") if you lose the authenticator app. Each works once. Keep them in a password manager.
- **Network isolation:** every app and every database has its own Docker network. An app can reach only the databases it is linked to, never other apps or unlinked databases. Containers from earlier versions are moved over automatically at startup; a redeploy is not needed.
