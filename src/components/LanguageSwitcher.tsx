import { useTranslation } from 'react-i18next';

interface LanguageSwitcherProps {
  size?: 'sm' | 'md';
}

export default function LanguageSwitcher({ size = 'sm' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const isEN = i18n.language === 'en';

  const toggle = () => {
    const next = isEN ? 'pt-BR' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  const textSize = size === 'md' ? 'text-[12px]' : 'text-[10px]';

  return (
    <button
      onClick={toggle}
      title={isEN ? 'Switch to Portuguese' : 'Switch to English'}
      className={`flex items-center rounded-md overflow-hidden transition-all ${textSize} font-black uppercase tracking-wider shrink-0`}
      style={{ border: '1px solid var(--color-border-strong)' }}
    >
      <span
        className="px-2 py-1 transition-colors"
        style={{
          background: !isEN ? 'var(--color-primary)' : 'var(--color-surface-alt)',
          color: !isEN ? '#fff' : 'var(--color-text-dim)',
        }}
      >
        PT
      </span>
      <span
        className="px-2 py-1 transition-colors"
        style={{
          background: isEN ? 'var(--color-primary)' : 'var(--color-surface-alt)',
          color: isEN ? '#fff' : 'var(--color-text-dim)',
        }}
      >
        EN
      </span>
    </button>
  );
}
