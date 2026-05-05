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
  const pad = size === 'md' ? 'px-2.5 py-1.5' : 'px-2 py-1';
  const fixedWidth = size === 'md' ? 'w-[74px]' : 'w-[64px]';

  return (
    <button
      onClick={toggle}
      type="button"
      aria-label={isEN ? 'Switch to Portuguese' : 'Switch to English'}
      title={isEN ? 'Switch to Portuguese' : 'Switch to English'}
      className={`relative inline-grid grid-cols-2 rounded-lg overflow-hidden shrink-0 ${fixedWidth} ${textSize} font-black uppercase tracking-wider transition-colors duration-300`}
      style={{
        border: '1px solid var(--color-border-strong)',
        background: 'var(--color-surface-alt)',
      }}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] bottom-[2px] w-[calc(50%-4px)] rounded-md transition-transform duration-300 ease-out will-change-transform`}
        style={{
          left: '2px',
          transform: isEN ? 'translateX(100%)' : 'translateX(0%)',
          background: 'var(--color-primary)',
          boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
        }}
      />
      <span
        className={`${pad} relative z-10 transition-colors duration-300`}
        style={{
          color: !isEN ? '#fff' : 'var(--color-text-dim)',
        }}
      >
        PT
      </span>
      <span
        className={`${pad} relative z-10 transition-colors duration-300`}
        style={{
          color: isEN ? '#fff' : 'var(--color-text-dim)',
        }}
      >
        EN
      </span>
    </button>
  );
}
