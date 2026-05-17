import InstallAgentFlow from '../components/InstallAgentFlow';

export default function Install({ token }: { token: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
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
