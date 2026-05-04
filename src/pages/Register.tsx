import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Eye, EyeOff, Loader2, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  filterEmailInput,
  filterEstablishmentName,
  filterPersonName,
  isValidEmail,
  normalizeEmail,
} from '../lib/authInput';

interface RegisterProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export default function Register({ onBack, onSuccess }: RegisterProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [establishmentName, setEstablishmentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const person = filterPersonName(fullName);
    if (person.length < 2) {
      setError(t('register.nameRequired'));
      return;
    }

    const est = filterEstablishmentName(establishmentName);
    if (est.length < 2) {
      setError(t('register.businessRequired'));
      return;
    }

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError(t('errors.invalidEmail'));
      return;
    }

    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      setError(t('errors.passwordRange', { min: PASSWORD_MIN, max: PASSWORD_MAX }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('errors.passwordsDontMatch'));
      return;
    }

    setLoading(true);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: person,
          establishment_name: est,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message || t('register.cantCreateAccount'));
      return;
    }

    if (data.session) {
      onSuccess?.();
      return;
    }

    setInfo(t('register.emailConfirmation'));
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg p-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-text-dim hover:text-text text-sm font-medium transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          {t('register.backToLogin')}
        </button>
        <h1 className="text-2xl font-black uppercase tracking-tight text-text">{t('register.title')}</h1>
        <p className="text-text-dim text-sm mt-2">{t('register.desc')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[11px] uppercase font-black tracking-widest text-text-dim block mb-2">
              {t('register.yourName')}
            </span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(filterPersonName(e.target.value))}
                required
                minLength={2}
                maxLength={120}
                className="w-full bg-surface-alt border border-border rounded pl-10 pr-3 py-2.5 text-text focus:outline-none focus:border-primary"
                placeholder={t('register.namePlaceholder')}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase font-black tracking-widest text-text-dim block mb-2">
              {t('register.businessName')}
            </span>
            <div className="relative">
              <Building2
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
                size={16}
              />
              <input
                type="text"
                autoComplete="organization"
                value={establishmentName}
                onChange={(e) => setEstablishmentName(filterEstablishmentName(e.target.value))}
                required
                minLength={2}
                maxLength={120}
                className="w-full bg-surface-alt border border-border rounded pl-10 pr-3 py-2.5 text-text focus:outline-none focus:border-primary"
                placeholder={t('register.businessPlaceholder')}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase font-black tracking-widest text-text-dim block mb-2">
              {t('common.email')}
            </span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(filterEmailInput(e.target.value))}
                onBlur={() => setEmail((v) => normalizeEmail(v))}
                required
                maxLength={EMAIL_MAX}
                className={cn(
                  'w-full bg-surface-alt border rounded pl-10 pr-3 py-2.5 text-text focus:outline-none',
                  email && !isValidEmail(normalizeEmail(email))
                    ? 'border-warning/50 focus:border-warning'
                    : 'border-border focus:border-primary'
                )}
                placeholder="seu@email.com"
              />
            </div>
            {email && !isValidEmail(normalizeEmail(email)) && (
              <p className="text-warning text-xs mt-1">{t('errors.invalidEmailFormat')}</p>
            )}
          </label>

          <label className="block">
            <span className="text-[11px] uppercase font-black tracking-widest text-text-dim block mb-2">
              {t('common.password')}
            </span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX))}
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                className="w-full bg-surface-alt border border-border rounded px-3 py-2.5 pr-11 text-text focus:outline-none focus:border-primary"
                placeholder={t('common.minChars', { count: PASSWORD_MIN })}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-dim hover:text-text rounded"
                aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase font-black tracking-widest text-text-dim block mb-2">
              {t('common.confirmPassword')}
            </span>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value.slice(0, PASSWORD_MAX))}
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                className="w-full bg-surface-alt border border-border rounded px-3 py-2.5 pr-11 text-text focus:outline-none focus:border-primary"
                placeholder={t('login.reset.repeatPassword')}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-dim hover:text-text rounded"
                aria-label={showConfirm ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm px-3 py-2 rounded">
              {error}
            </div>
          )}

          {info && (
            <div className="bg-success/10 border border-success/30 text-success text-sm px-3 py-2 rounded">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded font-black text-[11px] uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('register.createAccount')}
          </button>
        </form>
      </div>
    </div>
  );
}
