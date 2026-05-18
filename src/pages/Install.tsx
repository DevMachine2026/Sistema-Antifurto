import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import InstallAgentFlow from '../components/InstallAgentFlow';
import { supabase } from '../lib/supabase';
import Login from './Login';

export default function Install({ token }: { token: string }) {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <Loader2 className="animate-spin w-8 h-8 text-text-dim" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <Login
        onSuccess={() => setHasSession(true)}
        onGoRegister={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <img src="/logo.svg" alt="Olho Vivo" className="h-10 mx-auto mb-6" />
        <InstallAgentFlow token={token} />
      </div>
    </div>
  );
}
