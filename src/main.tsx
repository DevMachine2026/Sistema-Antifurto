import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Install from './pages/Install.tsx';
import './i18n';
import './index.css';

const installMatch = window.location.pathname.match(/^\/install\/(.+)$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {installMatch ? <Install token={installMatch[1]} /> : <App />}
  </StrictMode>,
);
