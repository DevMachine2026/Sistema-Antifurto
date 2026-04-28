export function parseBRL(value: string): number {
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
}

export function extractDate(text: string): string {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return new Date(`${yyyy}-${mm}-${dd}T20:00:00`).toISOString();
  }
  return new Date().toISOString();
}
