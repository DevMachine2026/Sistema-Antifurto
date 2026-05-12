import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './i18n';
import './index.css';

const Install = lazy(() => import('./pages/Install.tsx'));

const installMatch = window.location.pathname.match(/^\/install\/(.+)$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {installMatch ? (
      <Suspense fallback={<div className="min-h-screen bg-[#0a0a12]" />}>
        <Install token={installMatch[1]} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
