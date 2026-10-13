/**
 * Normalizes short interface abbreviations to full Cisco interface names.
 * e.g. "fa0/1" -> "FastEthernet0/1", "gi0/0" -> "GigabitEthernet0/0"
 */
export function normalizeInterfaceName(input: string): string {
  const clean = input.trim();
  const lower = clean.toLowerCase();

  if (/^(fastethernet|fa|f)\s*\d+(\/\d+)*$/i.test(lower)) {
    const num = clean.replace(/^(fastethernet|fa|f)\s*/i, '');
    return `FastEthernet${num}`;
  }

  if (/^(gigabitethernet|gi|g)\s*\d+(\/\d+)*$/i.test(lower)) {
    const num = clean.replace(/^(gigabitethernet|gi|g)\s*/i, '');
    return `GigabitEthernet${num}`;
  }

  if (/^(serial|se|s)\s*\d+(\/\d+)*$/i.test(lower)) {
    const num = clean.replace(/^(serial|se|s)\s*/i, '');
    return `Serial${num}`;
  }

  return clean;
}
