/** Whether what was typed matches the phrase that unlocks a destructive button. Case matters; stray spaces around it do not. */
export function matchesConfirmPhrase(typed: string, phrase: string): boolean {
  return phrase.length > 0 && typed.trim() === phrase;
}
