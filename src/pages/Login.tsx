import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, Mail, Camera, TrendingUp, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  filterEmailInput,
  isValidEmail,
  normalizeEmail,
} from '../lib/authInput';

interface LoginProps {
  onSuccess: () => void;
  onGoRegister?: () => void;
}

const FEATURES = [
  {
    Icon: Camera,
    label: 'Contagem de Pessoas (R01)',
    desc: 'Câmeras cruzam fluxo real com capacidade do salão em tempo real.',
  },
  {
    Icon: TrendingUp,
    label: 'Gap Financeiro (R02)',
    desc: 'Reconciliação automática entre maquineta e sistema de vendas.',
  },
  {
    Icon: AlertCircle,
    label: 'Cash Ghost (R05)',
    desc: 'Detecção de pagamentos em espécie não registrados no sistema.',
  },
];

function FormInput({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-widest text-text-dim">{label}</label>
        {hint}
      </div>
      {children}
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  );
}

function inputCls(invalid = false) {
  return cn(
    'w-full bg-bg border rounded-lg px-4 py-3 text-text text-sm placeholder:text-text-dim/40',
    'focus:outline-none focus:ring-1 transition-colors',
    invalid
      ? 'border-warning/50 focus:border-warning/70 focus:ring-warning/10'
      : 'border-border focus:border-primary/60 focus:ring-primary/10'
  );
}

function PrimaryButton({ loading, label, icon: Icon }: { loading: boolean; label: string; icon: any }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 active:scale-[0.99] text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      {label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-danger/8 border border-danger/25 text-danger text-sm px-4 py-3 rounded-lg">
      <AlertCircle size={15} className="shrink-0 mt-0.5" />
      {message}
    </div>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className="bg-success/8 border border-success/25 text-success text-sm px-4 py-3 rounded-lg">
      {message}
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="hidden lg:flex w-[440px] xl:w-[520px] shrink-0 flex-col justify-between bg-surface border-r border-border p-10 xl:p-12 relative overflow-hidden">
      {/* Grid decorativo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 48px)',
        }}
      />
      {/* Gradiente suave no canto */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-primary/5 to-transparent" />

      {/* Logo */}
      <div className="relative flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ShieldCheck size={16} className="text-primary" />
        </div>
        <span className="font-display font-bold text-[15px] tracking-wide">
          Olho <span className="text-primary">Vivo</span>
        </span>
      </div>

      {/* Conteúdo central */}
      <div className="relative space-y-8">
        <div>
          <h2 className="text-[28px] xl:text-[32px] font-bold text-text leading-tight tracking-tight">
            Controle total sobre o seu estabelecimento.
          </h2>
          <p className="text-text-dim text-[14px] mt-3 leading-relaxed max-w-sm">
            Detecção de anomalias em tempo real cruzando câmeras, maquinetas e sistemas de bilheteria.
          </p>
        </div>

        <div className="space-y-5">
          {FEATURES.map(({ Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-surface-alt border border-border flex items-center justify-center shrink-0">
                <Icon size={15} className="text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-text">{label}</p>
                <p className="text-[12px] text-text-dim leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div className="relative text-[11px] text-text-dim/60 font-mono">
        © 2026 Dev Machine · v1.0 MVP
      </div>
    </aside>
  );
}

export default function Login({ onSuccess, onGoRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('type') === 'recovery') setView('reset');
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) { setError('Informe um email válido.'); return; }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      setError(`Senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`);
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalized, password });
    setLoading(false);
    if (signInError) { setError('Email ou senha inválidos.'); return; }
    onSuccess();
  }

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(forgotEmail);
    if (!isValidEmail(normalized)) { setError('Informe um email válido.'); return; }
    setForgotLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    setForgotLoading(false);
    if (resetError) { setError('Não foi possível enviar o email. Tente novamente.'); return; }
    setForgotSent(true);
  }

  async function handleResetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      setError(`Senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    setResetLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (updateError) { setError('Não foi possível atualizar a senha. Solicite um novo link.'); return; }
    window.history.replaceState(null, '', window.location.pathname);
    setView('login');
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    setError(null);
    onSuccess();
  }

  const pageWrapper = (content: React.ReactNode) => (
    <div className="min-h-screen bg-bg flex text-text">
      <BrandPanel />
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldCheck size={14} className="text-primary" />
            </div>
            <span className="font-display font-bold text-[14px] tracking-wide">
              Olho <span className="text-primary">Vivo</span>
            </span>
          </div>
          {content}
        </div>
      </div>
    </div>
  );

  if (view === 'reset') {
    return pageWrapper(
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Defina nova senha</h1>
          <p className="text-text-dim text-sm mt-1">Escolha uma senha segura para sua conta.</p>
        </div>

        <form onSubmit={handleResetSubmit} className="space-y-4">
          <FormInput label="Nova senha">
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value.slice(0, PASSWORD_MAX))}
                required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                className={inputCls()}
                placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNewPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition-colors"
                aria-label={showNewPassword ? 'Ocultar' : 'Mostrar'}>
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormInput>

          <FormInput label="Confirmar senha">
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value.slice(0, PASSWORD_MAX))}
                required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                className={inputCls()}
                placeholder="Repita a senha"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition-colors"
                aria-label={showConfirmPassword ? 'Ocultar' : 'Mostrar'}>
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormInput>

          {error && <ErrorBox message={error} />}
          <PrimaryButton loading={resetLoading} label="Salvar senha" icon={ShieldCheck} />
        </form>
      </div>
    );
  }

  if (view === 'forgot') {
    return pageWrapper(
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Recuperar acesso</h1>
          <p className="text-text-dim text-sm mt-1">Enviaremos um link para redefinir sua senha.</p>
        </div>

        {forgotSent ? (
          <div className="space-y-4">
            <SuccessBox message="Se esse email estiver cadastrado, você receberá as instruções em instantes. Verifique a caixa de spam." />
            <button type="button" onClick={() => { setView('login'); setError(null); setForgotSent(false); }}
              className="w-full text-center text-sm text-primary font-semibold hover:underline">
              Voltar ao login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <FormInput label="Email">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim/50" size={15} />
                <input
                  type="email" inputMode="email" autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(filterEmailInput(e.target.value))}
                  onBlur={() => setForgotEmail(v => normalizeEmail(v))}
                  required className={cn(inputCls(), 'pl-10')} placeholder="seu@email.com"
                />
              </div>
            </FormInput>

            {error && <ErrorBox message={error} />}
            <PrimaryButton loading={forgotLoading} label="Enviar link de recuperação" icon={Mail} />

            <button type="button" onClick={() => { setView('login'); setError(null); }}
              className="w-full text-center text-sm text-text-dim hover:text-text transition-colors">
              Voltar ao login
            </button>
          </form>
        )}
      </div>
    );
  }

  return pageWrapper(
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Acesso à Plataforma</h1>
        <p className="text-text-dim text-sm mt-1">Entre com suas credenciais para continuar.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Email"
          error={email && !isValidEmail(normalizeEmail(email)) ? 'Formato de email inválido.' : undefined}
        >
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim/50" size={15} />
            <input
              type="email" inputMode="email" autoComplete="email"
              value={email}
              onChange={(e) => setEmail(filterEmailInput(e.target.value))}
              onBlur={() => setEmail(v => normalizeEmail(v))}
              required
              className={cn(inputCls(email !== '' && !isValidEmail(normalizeEmail(email))), 'pl-10')}
              placeholder="seu@email.com"
              maxLength={EMAIL_MAX}
            />
          </div>
        </FormInput>

        <FormInput
          label="Senha"
          hint={
            <button type="button"
              onClick={() => { setForgotEmail(normalizeEmail(email)); setView('forgot'); setError(null); setForgotSent(false); }}
              className="text-[11px] font-bold text-primary hover:underline">
              Esqueci minha senha
            </button>
          }
        >
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX))}
              required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
              autoComplete="current-password"
              className={cn(inputCls(), 'pr-11')}
              placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
            />
            <button type="button" tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition-colors"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormInput>

        {error && <ErrorBox message={error} />}

        <PrimaryButton loading={loading} label="Entrar" icon={LogIn} />
      </form>

      {onGoRegister && (
        <div className="pt-2 text-center">
          <span className="text-sm text-text-dim">Ainda não tem conta? </span>
          <button type="button" onClick={onGoRegister}
            className="text-sm text-primary font-semibold hover:underline">
            Cadastrar meu comércio
          </button>
        </div>
      )}
    </div>
  );
}
