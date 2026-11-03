/** What a project is built with, for showing its logo and name. It never changes how the project is built or run. */
export type Stack =
  | "nextjs" | "nuxt" | "angular" | "astro" | "svelte" | "remix" | "react" | "vue"
  | "nestjs" | "express" | "fastify" | "vite" | "node" | "html" | "docker" | "shopify" | "unknown";

const STACK_LABELS: Record<Stack, string> = {
  nextjs: "Next.js", nuxt: "Nuxt", angular: "Angular", astro: "Astro", svelte: "Svelte", remix: "Remix",
  react: "React", vue: "Vue", nestjs: "NestJS", express: "Express", fastify: "Fastify", vite: "Vite",
  node: "Node.js", html: "Static HTML", docker: "Docker", shopify: "Shopify app", unknown: "Unknown",
};

/** Package that proves a stack, most specific first: a Next.js app also depends on React, so Next.js must win. */
const STACK_BY_PACKAGE: [string, Stack][] = [
  ["next", "nextjs"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
  ["astro", "astro"],
  ["@sveltejs/kit", "svelte"],
  ["svelte", "svelte"],
  ["@remix-run/react", "remix"],
  ["@nestjs/core", "nestjs"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["react", "react"],
  ["vue", "vue"],
  ["vite", "vite"],
];

export function stackFromDependencies(deps: Record<string, unknown>): Stack {
  return STACK_BY_PACKAGE.find(([name]) => name in deps)?.[1] ?? "node";
}

export function stackLabel(stack: Stack): string {
  return STACK_LABELS[stack];
}

const STACK_BY_FRAMEWORK: Record<string, Stack> = {
  nextjs: "nextjs", vite: "vite", express: "express", node: "node", static: "html", dockerfile: "docker", shopify: "shopify",
};

/** The stack of a saved project. Projects saved before stacks existed fall back to their framework. */
export function stackOf(config: { framework: string; stack?: string }): Stack {
  if (config.stack && config.stack in STACK_LABELS) return config.stack as Stack;
  return STACK_BY_FRAMEWORK[config.framework] ?? "unknown";
}
