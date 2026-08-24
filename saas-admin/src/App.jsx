import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Unidades } from './pages/Unidades';
import { Plano } from './pages/Plano';
import { Settings } from './pages/Settings';
import { Organizacoes } from './pages/Organizacoes';

function Shell() {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Header />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/unidades" element={<Unidades />} />
          <Route path="/plano" element={<Plano />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/organizacoes" element={<Organizacoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Carregando...</div>;
  }
  return session ? <Shell /> : <Login />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
