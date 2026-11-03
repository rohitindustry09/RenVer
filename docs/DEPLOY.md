# Running RenVer for real

This covers three things: keeping it running on your own computer, moving it to a server with a public domain, and what to check before you trust it with real apps.

## 1. On your computer (Windows)

```bash
npm run build          # once, and again after any code change
npm start              # or: npm run serve   (builds, then starts)
```

Use the production build. `npm run dev` compiles each page the first time you open it, which is why it feels slow.

To start it by itself when you sign in (so it survives a reboot):

```bash
powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1
```

Also set Docker Desktop to start at sign-in. After a reboot RenVer's watchdog restarts any app or database container that should be running and re-sends the routes to Caddy.

Remove it again with `-Remove`.

## 2. On a server (VPS)

You need a Linux server (Ubuntu 22.04+ or Debian 12+, 2 GB RAM or more) and a domain.

1. **DNS.** At your domain's DNS provider add two A records pointing at the server's public IP: `@` (the domain itself) and `*` (every subdomain). Add the panel name too if you do not use the wildcard, for example `panel`.
2. **Install tools.** Copy the project to the server, then:
   ```bash
   sudo bash scripts/install.sh --domain example.com
   ```
   It installs Docker, Caddy, Git and Node.js, after showing what it will do.
3. **Settings.** Create `/etc/renver.env` (mode 600):
   ```
   RENVER_ADMIN_PASSWORD=choose-a-long-password
   ```
   In `scripts/renver.service` set `RENVER_BASE_DOMAIN` (your domain) and `RENVER_PANEL_HOST` (for example `panel.example.com`). In production the panel refuses to start without a password.
4. **Build and run.**
   ```bash
   npm ci && npm run build
   sudo cp scripts/renver.service /etc/systemd/system/ && sudo systemctl enable --now renver
   ```
5. **Open the panel** at `https://panel.example.com`. Caddy gets the HTTPS certificate by itself the first time the name is used; ports 80 and 443 must be open in the server's firewall.
6. **Add your domain** on the Domains page and add the TXT record it shows, so RenVer knows you own it.

Updating RenVer later: copy the new code, then `npm ci && npm run build && sudo systemctl restart renver`. Your projects keep running while it restarts.

### Which port RenVer uses

`npm start`, `npm run dev` and the service all start RenVer through `scripts/launcher.mjs`. It uses port 3000, or `RENVER_PORT` if you set one. **If that port is taken it picks the next free one** and tells you, and the panel's proxy route follows automatically, so nothing needs changing.

It also refuses to start a **second** RenVer on the same data folder (two panels sharing one database would run every backup and check twice). It prints where the running one is instead. The lock lives in `data/.renver.lock` and is ignored once that process is gone, so a crash never blocks the next start.

In `scripts/renver.service`, if `node` is not at `/usr/bin/node` on your server (for example it was installed with nvm), change the `ExecStart` path (`which node` shows it).

### What those commands do

```bash
npm ci && npm run build && sudo systemctl enable --now renver
```

Each command runs only if the one before it worked (`&&`):

- `npm ci` installs the exact packages in `package-lock.json`, from scratch, so every machine gets the same result.
- `npm run build` compiles RenVer into its fast production version (the `.next` folder). This is where the UI becomes the final site.
- `sudo systemctl enable --now renver` tells systemd, the service manager built into Linux: `enable` starts RenVer at every boot, `--now` also starts it right away. It needs `sudo` because services are managed as an administrator, and it only works after the service file is installed (step 4 above).

Day to day:

```bash
sudo systemctl status renver       # is it running?
sudo systemctl restart renver      # after an update
sudo systemctl stop renver         # stop it
journalctl -u renver -f            # watch its output
```

### systemd or PM2?

systemd does the same job as PM2 (keep it running in the background, restart it if it crashes, start it after a reboot) and is already on the server, so nothing extra is installed. It also starts RenVer after Docker is up. PM2 works too if you prefer it:

```bash
npm install -g pm2
pm2 start scripts/launcher.mjs --name renver -- start
pm2 startup && pm2 save            # start at boot
```

With PM2 set the environment variables (`RENVER_MODE`, `RENVER_ADMIN_PASSWORD`, …) in `.env` in the project folder, because it does not read `/etc/renver.env`. Use one of the two, not both.

## 3. Before you rely on it

- **Test one real domain first.** Deploy a small app on a spare subdomain and check that `https://` works and the certificate is valid. Everything on `*.localhost` runs without certificates, so only a real domain proves this part.
- **Reboot the machine once** and check that the panel, Caddy and your apps come back by themselves.
- **Backups.** Every backup (automatic, manual or full) holds RenVer's settings and keys **and the data inside your running databases**, so one file is enough to bring everything back. A full backup also keeps each project's source, which is what lets apps be rebuilt on a new machine. Each database also has its own backups (Databases page → Backups) if you only want to save or restore one. Copy a backup off the machine now and then (Settings → Backups → Download): a backup on the same disk does not protect you from losing the disk.
- **Restoring.** Settings → Backups → Restore (or `npm run restore -- <file>` if RenVer will not start). Everything comes back **paused**. Resume each database first (it is created again and its data loaded if needed), then each project. A paused database is not included in new backups, because its data cannot be read until it runs.
- **Panel password.** Always set `RENVER_ADMIN_PASSWORD` on a server. The panel can run code, so anyone who can open it controls the machine.
- **Alerts.** Settings → Notifications sends a message to Discord, Slack or Telegram when something needs attention.
- **Auto-deploy.** On a project imported from GitHub, Settings → Auto-deploy shows the address and secret to paste into the repository's webhook settings. It only works when the panel is reachable from the internet.

## Troubleshooting

- *A page says the app is not responding:* open the project → Runtime for its logs, memory use and a restart button.
- *Out of memory:* lower the memory per app in Settings, or give one project its own limit under Runtime.
- *Something went wrong after a change:* Deployments → open an older deployment that was live → "Redeploy this version".
