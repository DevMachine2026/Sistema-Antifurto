const STORAGE_KEY = 'antifraud.establishment_id';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Apenas desenvolvimento local: VITE_ESTABLISHMENT_ID no .env */
export function getDevEstablishmentId(): string | null {
  return normalize(import.meta.env.VITE_ESTABLISHMENT_ID) || null;
}

export function tryGetCurrentEstablishmentId(): string | null {
  const fromStorage =
    typeof window !== 'undefined'
      ? normalize(window.localStorage.getItem(STORAGE_KEY))
      : '';
  return fromStorage || getDevEstablishmentId();
}

export function getCurrentEstablishmentId(): string {
  const id = tryGetCurrentEstablishmentId();
  if (!id) {
    throw new Error(
      'Estabelecimento não selecionado. Faça login ou escolha o estabelecimento no painel.',
    );
  }
  return id;
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
