import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { BookOpen, ChevronRight, HelpCircle } from 'lucide-react';
import guideContent from '../GUIDE.md?raw';

export default function Guide() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded flex items-center justify-center">
          <BookOpen size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">{t('guide.title')}</h2>
          <p className="text-text-dim text-sm">{t('guide.subtitle')}</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border px-6 py-8 lg:px-10 lg:py-10 shadow-sm">
        <div className="markdown-body">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-3xl font-black tracking-tight text-text mb-6 leading-tight">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-bold text-text mt-10 mb-4 leading-snug">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-bold text-text mt-7 mb-3">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-[15px] leading-8 text-text/95 mb-5 max-w-3xl">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-6 mb-6 space-y-2 text-[15px] leading-8 text-text/95 max-w-3xl">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 mb-6 space-y-2 text-[15px] leading-8 text-text/95 max-w-3xl">{children}</ol>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              hr: () => <hr className="my-8 border-border/70" />,
              strong: ({ children }) => <strong className="font-bold text-text">{children}</strong>,
              code: ({ children }) => (
                <code className="px-1.5 py-0.5 rounded bg-surface-alt text-primary font-mono text-[13px]">{children}</code>
              ),
            }}
          >
            {guideContent}
          </ReactMarkdown>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-alt p-6 rounded border border-border border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-primary mb-2">
            <HelpCircle size={18} />
            <span className="text-xs font-black uppercase tracking-widest">{t('guide.support.title')}</span>
          </div>
          <p className="text-text font-bold text-sm">{t('guide.support.problem')}</p>
          <p className="text-text-dim text-xs mt-1">{t('guide.support.hint')}</p>
        </div>

        <div className="bg-surface-alt p-6 rounded border border-border border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-success mb-2">
            <ChevronRight size={18} />
            <span className="text-xs font-black uppercase tracking-widest">{t('guide.tip.title')}</span>
          </div>
          <p className="text-text font-bold text-sm">{t('guide.tip.problem')}</p>
          <p className="text-text-dim text-xs mt-1">{t('guide.tip.hint')}</p>
        </div>
      </div>
    </div>
  );
}
