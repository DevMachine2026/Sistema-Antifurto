import type { TFunction } from 'i18next';
import type { AlertType } from '../types';

export function getAlertHumanTitle(type: AlertType, t: TFunction): string {
  const key = `alerts.human.${type}.title`;
  const translated = t(key);
  return translated === key ? t('alerts.human.default.title') : translated;
}

export function getAlertHumanHint(type: AlertType, t: TFunction): string {
  const key = `alerts.human.${type}.hint`;
  const translated = t(key);
  return translated === key ? t('alerts.human.default.hint') : translated;
}

export type QuickResolution = 'false_positive' | 'fixed_at_register' | 'escalate';

export function getResolutionLabel(resolution: QuickResolution, t: TFunction): string {
  return t(`alerts.resolution.${resolution}`);
}
