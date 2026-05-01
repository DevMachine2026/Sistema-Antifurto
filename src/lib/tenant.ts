const STORAGE_KEY = 'antifraud.establishment_id';
const DEFAULT_ESTABLISHMENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getCurrentEstablishmentId(): string {
  const fromEnv = normalize(import.meta.env.VITE_ESTABLISHMENT_ID);
  const fromStorage =
    typeof window !== 'undefined'
      ? normalize(window.localStorage.getItem(STORAGE_KEY))
      : '';

  const establishmentId = fromStorage || fromEnv || DEFAULT_ESTABLISHMENT_ID;

  if (typeof window !== 'undefined' && !fromStorage) {
    window.localStorage.setItem(STORAGE_KEY, establishmentId);
  }

  if (!fromStorage && !fromEnv) {
    console.warn(
      '[tenant] Establishment ID não configurado em env/localStorage. Usando tenant demo padrão.'
    );
  }

  return establishmentId;
}

export function setCurrentEstablishmentId(establishmentId: string): void {
  const normalized = normalize(establishmentId);
  if (!normalized) {
    throw new Error('Establishment ID inválido.');
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  }
}

export function clearCurrentEstablishmentId(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
