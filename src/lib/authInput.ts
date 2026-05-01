export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function filterEmailInput(raw: string): string {
  return raw.replace(/[^\w.@+-]/gi, '').slice(0, EMAIL_MAX);
}

/** Nome comercial: letras, números, espaço e hífen; normaliza espaços */
export function filterEstablishmentName(raw: string): string {
  const cleaned = raw.replace(/[^\p{L}\p{N}\s\-'.&]/gu, '').replace(/\s+/g, ' ');
  return cleaned.trim().slice(0, 120);
}

export function filterPersonName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}\s\-'.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
