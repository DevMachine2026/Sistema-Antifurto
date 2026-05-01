/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Shell from './components/layout/Shell';
import AdminShell from './components/layout/AdminShell';
import AdminPanel from './pages/AdminPanel';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/Upload';
import AlertsPage from './pages/Alerts';
import Settings from './pages/Settings';
import Guide from './pages/Guide';
import Simulator from './pages/Simulator';
import Integrations from './pages/Integrations';
import AuditTrail from './pages/AuditTrail';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { setCurrentEstablishmentId, getCurrentEstablishmentId, clearCurrentEstablishmentId } from './lib/tenant';
import SelectEstablishment from './pages/SelectEstablishment';

interface AccessContext {
  role: 'platform_admin' | 'merchant_admin';
  establishments: Array<{ id: string; name: string }>;
  ownEstablishments: Array<{ id: string; name: string }>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminView, setAdminView] = useState<'platform' | 'monitoring'>('platform');
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessContext, setAccessContext] = useState<AccessContext | null>(null);
  const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'register'>('landing');

  async function loadAccessContext(userId: string) {
    setAccessLoading(true);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const role = (profileData?.role ?? 'merchant_admin') as AccessContext['role'];

    // Busca estabelecimentos vinculados ao usuário (independente do papel)
    const { data: memberships } = await supabase
      .from('user_establishments')
      .select('establishment_id')
      .eq('user_id', userId)
      .eq('active', true);

    const ownIds = (memberships ?? []).map((m: any) => m.establishment_id).filter(Boolean);

    let ownEstablishments: Array<{ id: string; name: string }> = [];
    if (ownIds.length > 0) {
      const { data: ownEsts } = await supabase
        .from('establishments')
        .select('id, name')
        .in('id', ownIds)
        .order('name', { ascending: true });
      ownEstablishments = (ownEsts ?? []) as Array<{ id: string; name: string }>;
    }

    let establishments: Array<{ id: string; name: string }> = [];
    if (role === 'platform_admin') {
      const { data: allEstablishments } = await supabase
        .from('establishments')
        .select('id,name')
        .order('name', { ascending: true });
      establishments = (allEstablishments ?? []) as Array<{ id: string; name: string }>;
    } else {
      establishments = ownEstablishments;
    }

    if (ownEstablishments.length > 0) {
      setCurrentEstablishmentId(ownEstablishments[0].id);
    } else if (establishments.length > 0) {
      const current = getCurrentEstablishmentId();
      const exists = establishments.some((item) => item.id === current);
      if (!exists) setCurrentEstablishmentId(establishments[0].id);
    }

    setAccessContext({ role, establishments, ownEstablishments });
    setAccessLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setCheckingSession(false);
      if (data.session?.user?.id) {
        void loadAccessContext(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user?.id) {
        void loadAccessContext(nextSession.user.id);
      } else {
        setAccessContext(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    clearCurrentEstablishmentId();
    await supabase.auth.signOut();
  }

  const currentEstId   = getCurrentEstablishmentId();
  const currentEstName = accessContext?.establishments.find((e) => e.id === currentEstId)?.name;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'upload':
        return <UploadPage />;
      case 'alerts':
        return <AlertsPage establishmentName={currentEstName} />;
      case 'guide':
        return <Guide />;
      case 'simulator':
        return <Simulator />;
      case 'integrations':
        return <Integrations />;
      case 'settings':
        return <Settings />;
      case 'audit':
        return <AuditTrail />;
      case 'analytics':
        return (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
            <div className="bg-indigo-50 p-6 rounded-full text-indigo-600">
               <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-construction"><rect x="2" y="18" width="20" height="2"/><path d="M10 13v5"/><path d="M14 13v5"/><path d="M22 18H2"/><path d="m17 13-5-5-5 5"/><path d="m5 13 5-5 5 5"/></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Em Desenvolvimento</h2>
            <p className="text-slate-500 max-w-sm">A ferramenta de análise preditiva avançada estará disponível na Fase 2 do projeto.</p>
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-dim">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!session) {
    if (authScreen === 'landing') {
      return (
        <Landing
          onLogin={() => setAuthScreen('login')}
          onRegister={() => setAuthScreen('register')}
        />
      );
    }
    if (authScreen === 'register') {
      return (
        <Register
          onBack={() => setAuthScreen('landing')}
          onSuccess={() => setAuthScreen('login')}
        />
      );
    }
    return (
      <Login
        onSuccess={() => void 0}
        onGoRegister={() => setAuthScreen('register')}
      />
    );
  }

  if (accessLoading || !accessContext) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-dim">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (accessContext.establishments.length === 0 && accessContext.role !== 'platform_admin') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="max-w-md bg-surface border border-border rounded-lg p-6 text-center space-y-4">
          <h2 className="text-xl font-bold text-text">Acesso pendente</h2>
          <p className="text-text-dim text-sm">
            Seu usuário ainda não está vinculado a um comércio. Isso costuma acontecer se a
            migration de cadastro automático não foi aplicada no banco, ou se a conta foi criada
            sem nome do estabelecimento.
          </p>
          <p className="text-text-dim text-sm">
            Administradores da plataforma também podem vincular você manualmente.
          </p>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              setAuthScreen('register');
            }}
            className="w-full px-4 py-3 bg-primary text-white rounded font-black text-[11px] uppercase tracking-widest"
          >
            Cadastrar meu comércio
          </button>
        </div>
      </div>
    );
  }

  const currentEstablishmentId = getCurrentEstablishmentId();
  const hasValidCurrentEstablishment = accessContext.establishments.some(
    (item) => item.id === currentEstablishmentId
  );

  if (accessContext.establishments.length > 1 && !hasValidCurrentEstablishment) {
    return (
      <SelectEstablishment
        items={accessContext.establishments}
        onSelect={(id) => {
          setCurrentEstablishmentId(id);
          window.location.reload();
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (accessContext.role === 'platform_admin') {
    const ownEst = accessContext.ownEstablishments[0] ?? null;

    if (adminView === 'monitoring' && ownEst) {
      return (
        <Shell
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={handleLogout}
          establishmentName={ownEst.name}
          onBackToAdmin={() => setAdminView('platform')}
        >
          {renderContent()}
        </Shell>
      );
    }

    return (
      <AdminShell
        onLogout={handleLogout}
        ownEstablishmentName={ownEst?.name}
        onSwitchToMonitoring={ownEst ? () => { setCurrentEstablishmentId(ownEst.id); setAdminView('monitoring'); } : undefined}
      >
        <AdminPanel />
      </AdminShell>
    );
  }

  return (
    <Shell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
      establishmentName={currentEstName}
    >
      {renderContent()}
    </Shell>
  );
}
