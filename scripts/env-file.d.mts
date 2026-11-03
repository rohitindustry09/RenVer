export function parseEnv(text: string): Record<string, string>;
export function formatEnvValue(value: string): string;
export function updateEnvText(text: string, updates: Record<string, string | undefined>): string;
