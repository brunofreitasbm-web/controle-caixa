import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getCurrentUser } from '../../lib/auth.js';
import { RealtimeProvider } from '../../lib/realtime.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  const user = getCurrentUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <RealtimeProvider usuario={user?.nome}>
      <div className="flex flex-col md:flex-row min-h-screen bg-gray-100">
        <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
