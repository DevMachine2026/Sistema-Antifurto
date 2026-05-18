/** Modo de navegação: Operação (leigo) vs Avançado (técnico/implantação). */
export type OperationMode = 'operation' | 'advanced';

const STORAGE_KEY = 'olhovivo_nav_mode';

export const OPERATION_NAV_IDS = [
  'dashboard',
  'readiness',
  'onboarding',
  'cameras',
  'alerts',
  'upload',
  'guide',
  'settings',
] as const;

export const ADVANCED_ONLY_NAV_IDS = [
  'agents',
  'posSync',
  'integrations',
  'simulator',
  'audit',
] as const;

export function getOperationMode(): OperationMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'advanced' ? 'advanced' : 'operation';
  } catch {
    return 'operation';
  }
}

export function setOperationMode(mode: OperationMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function isNavVisibleInMode(navId: string, mode: OperationMode): boolean {
  if (mode === 'advanced') return true;
  return (OPERATION_NAV_IDS as readonly string[]).includes(navId);
}
