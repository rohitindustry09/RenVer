export interface Command {
  id: string;
  label: string;
  /** Secondary text, searched too: a project's address, a page's description. */
  hint: string;
  href: string;
  group: string;
}

/** Score 0 = label starts with the query, 1 = label contains it, 2 = only the hint matches. */
function rank(command: Command, words: string[]): number | null {
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.hint.toLowerCase()}`;
  if (!words.every((word) => haystack.includes(word))) return null;
  if (words.every((word) => label.startsWith(word) || label.split(/\s+/).some((part) => part.startsWith(word)))) {
    return label.startsWith(words[0]!) ? 0 : 1;
  }
  return words.every((word) => label.includes(word)) ? 1 : 2;
}

/** Filters and orders commands for the Find palette. Every word of the query must match somewhere. */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];

  return commands
    .map((command, index) => ({ command, index, score: rank(command, words) }))
    .filter((entry): entry is { command: Command; index: number; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}
