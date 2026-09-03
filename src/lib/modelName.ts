/** "Anthropic: Claude Sonnet 5" -> "Claude Sonnet 5". Names without a producer prefix are unchanged. */
export function shortName(name: string): string {
  return name.replace(/^[^:]{1,40}:\s+/, '');
}
