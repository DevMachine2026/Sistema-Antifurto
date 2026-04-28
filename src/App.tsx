/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Shell from './components/layout/Shell';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/Upload';
import AlertsPage from './pages/Alerts';
import Settings from './pages/Settings';
import Guide from './pages/Guide';
import Simulator from './pages/Simulator';
import Integrations from './pages/Integrations';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'upload':
        return <UploadPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'guide':
        return <Guide />;
      case 'simulator':
        return <Simulator />;
      case 'integrations':
        return <Integrations />;
      case 'settings':
        return <Settings />;
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

  return (
    <Shell activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Shell>
  );
}
