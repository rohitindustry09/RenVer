// The systemd unit that keeps RenVer running on a Linux server. Used by `npm run service` and `npm run setup`.

/** Text of renver.service. `envPath` is only named in a comment: RenVer reads that file itself. */
export function buildUnit({ user, root, envPath, nodePath }) {
  return [
    "[Unit]",
    "Description=RenVer panel",
    "After=network-online.target docker.service",
    "Wants=network-online.target docker.service",
    "# Never give up restarting.",
    "StartLimitIntervalSec=0",
    "",
    "[Service]",
    "Type=simple",
    `User=${user}`,
    `WorkingDirectory=${root}`,
    "Environment=NODE_ENV=production",
    `# Settings are read from ${envPath} by RenVer itself. Do not repeat them here.`,
    `ExecStart=${nodePath} scripts/launcher.mjs start`,
    "Restart=always",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
}
