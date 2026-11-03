export const INSTALLABLE_TOOLS = ["caddy", "git", "node", "docker"] as const;
export type InstallableTool = (typeof INSTALLABLE_TOOLS)[number];

export interface InstallStep {
  command: string;
  args: string[];
  /** Exit codes that count as success; defaults to [0]. */
  okExitCodes?: number[];
}

/** winget exits non-zero when the package is already installed or has no newer version. */
const WINGET_UPDATE_NOT_APPLICABLE = 0x8a15002b;
const WINGET_ALREADY_INSTALLED = 0x8a150061;

export interface InstallPlan {
  description: string;
  steps: InstallStep[];
}

export type InstallPlanResult = { ok: true; plan: InstallPlan } | { ok: false; error: string };

const WINGET_IDS: Record<InstallableTool, string> = {
  caddy: "CaddyServer.Caddy",
  git: "Git.Git",
  node: "OpenJS.NodeJS.LTS",
  docker: "Docker.DockerDesktop",
};

const BREW_ARGS: Record<InstallableTool, string[]> = {
  caddy: ["install", "caddy"],
  git: ["install", "git"],
  node: ["install", "node"],
  docker: ["install", "--cask", "docker"],
};

/** Constant scripts only: nothing user-supplied is ever interpolated into these. */
const LINUX_SCRIPTS: Record<InstallableTool, string> = {
  git: "apt-get update -y && apt-get install -y git",
  docker: "curl -fsSL https://get.docker.com | sh",
  node: "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs",
  caddy: [
    "apt-get update -y",
    "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg",
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list",
    "apt-get update -y",
    "apt-get install -y caddy",
    "systemctl disable --now caddy || true",
  ].join(" && "),
};

export function isInstallableTool(value: string): value is InstallableTool {
  return (INSTALLABLE_TOOLS as readonly string[]).includes(value);
}

export function getInstallPlan(
  tool: InstallableTool,
  platform: string,
  isAdmin: boolean,
): InstallPlanResult {
  if (platform === "win32") {
    const id = WINGET_IDS[tool];
    return {
      ok: true,
      plan: {
        description: `winget install ${id}`,
        steps: [
          {
            command: "winget",
            args: ["install", "--id", id, "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
            okExitCodes: [0, WINGET_UPDATE_NOT_APPLICABLE, WINGET_ALREADY_INSTALLED],
          },
        ],
      },
    };
  }
  if (platform === "darwin") {
    const args = BREW_ARGS[tool];
    return {
      ok: true,
      plan: { description: `brew ${args.join(" ")}`, steps: [{ command: "brew", args }] },
    };
  }
  if (platform === "linux") {
    if (!isAdmin) {
      return { ok: false, error: "Installing packages needs root. Run the panel as root, or use scripts/install.sh with sudo." };
    }
    return {
      ok: true,
      plan: {
        description: tool === "docker" ? "official Docker install script (get.docker.com)" : `apt-get install ${tool}`,
        steps: [{ command: "sh", args: ["-c", LINUX_SCRIPTS[tool]] }],
      },
    };
  }
  return { ok: false, error: `Automatic install is not supported on ${platform}.` };
}
