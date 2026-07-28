import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '../components/layout/AppShell.jsx';
import RequireAuth from './RequireAuth.jsx';
import { getCurrentUser, rotaPadraoPorRole } from '../lib/auth.js';

import LoginPage from '../features/auth/LoginPage.jsx';

import RegistroEnvelopePage from '../features/caixa/RegistroEnvelopePage.jsx';
import DashboardEnvelopesPage from '../features/caixa/DashboardEnvelopesPage.jsx';
import HistoricoPage from '../features/caixa/HistoricoPage.jsx';
import DashboardMensalPage from '../features/caixa/DashboardMensalPage.jsx';
import AuditoriaAcoesPage from '../features/auditoria/AuditoriaAcoesPage.jsx';

import FaRegistroPage from '../features/facaAmigos/RegistroPage.jsx';
import FaDashboardPage from '../features/facaAmigos/DashboardPage.jsx';
import FaHistoricoPage from '../features/facaAmigos/HistoricoPage.jsx';
import FaMensalPage from '../features/facaAmigos/MensalPage.jsx';
import FaMetaPage from '../features/facaAmigos/MetaPage.jsx';
import FaRegrasPage from '../features/facaAmigos/RegrasPage.jsx';

import ColaboradoresPage from '../features/colaboradores/ColaboradoresPage.jsx';
import InsightsIACacauShowPage from '../features/insightsIA/InsightsIACacauShowPage.jsx';
import InsightsIAFacaAmigosPage from '../features/insightsIA/InsightsIAFacaAmigosPage.jsx';

import ImportacoesPage from '../features/importacoes/ImportacoesPage.jsx';
import ImportarNfePage from '../features/importacoes/ImportarNfePage.jsx';
import ImportarBoletosPage from '../features/importacoes/ImportarBoletosPage.jsx';
import ImportarMetasPage from '../features/importacoes/ImportarMetasPage.jsx';

import ConferenciaNfePage from '../features/conferenciaNfe/ConferenciaNfePage.jsx';
import MetaDoAnoPage from '../features/metaDoAno/MetaDoAnoPage.jsx';
import InventarioPage from '../features/inventario/InventarioPage.jsx';
import BoletosPage from '../features/boletos/BoletosPage.jsx';
import AuditoriaBoletosPage from '../features/boletos/AuditoriaBoletosPage.jsx';

import PastaAuditoriaCSPage from '../features/pastaAuditoria/PastaAuditoriaCSPage.jsx';
import PastaAuditoriaFAPage from '../features/pastaAuditoria/PastaAuditoriaFAPage.jsx';

import RhModuloPage from '../features/rh/RhModuloPage.jsx';
import ControlePontoPage from '../features/ponto/ControlePontoPage.jsx';
import MetaHoraHoraPage from '../features/metaHoraHora/MetaHoraHoraPage.jsx';

import PosVisitaPage from '../features/posVisita/PosVisitaPage.jsx';
import AniversariosPage from '../features/aniversarios/AniversariosPage.jsx';
import ConfiguracoesPage from '../features/configuracoes/ConfiguracoesPage.jsx';

function DefaultRedirect() {
  const user = getCurrentUser();
  return <Navigate to={user ? rotaPadraoPorRole(user.role) : '/login'} replace />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/caixa/registro" element={<RegistroEnvelopePage />} />
          <Route path="/caixa/dashboard" element={<DashboardEnvelopesPage />} />
          <Route path="/caixa/historico" element={<HistoricoPage />} />
          <Route path="/caixa/mensal" element={<DashboardMensalPage />} />
          <Route path="/auditoria" element={<AuditoriaAcoesPage />} />

          <Route path="/faca-amigos/registro" element={<FaRegistroPage />} />
          <Route path="/faca-amigos/dashboard" element={<FaDashboardPage />} />
          <Route path="/faca-amigos/historico" element={<FaHistoricoPage />} />
          <Route path="/faca-amigos/mensal" element={<FaMensalPage />} />
          <Route path="/faca-amigos/meta" element={<FaMetaPage />} />
          <Route path="/faca-amigos/regras" element={<FaRegrasPage />} />

          <Route path="/colaboradores" element={<ColaboradoresPage />} />
          <Route path="/insights-ia" element={<Navigate to="/insights-ia/cacau-show" replace />} />
          <Route path="/insights-ia/cacau-show" element={<InsightsIACacauShowPage />} />
          <Route path="/insights-ia/faca-amigos" element={<InsightsIAFacaAmigosPage />} />

          <Route path="/importacoes" element={<ImportacoesPage />} />
          <Route path="/importacoes/nfe" element={<ImportarNfePage />} />
          <Route path="/importacoes/boletos" element={<ImportarBoletosPage />} />
          <Route path="/importacoes/metas" element={<ImportarMetasPage />} />

          <Route path="/financeiro/conferencia-nfe" element={<ConferenciaNfePage />} />
          <Route path="/financeiro/meta-do-ano" element={<MetaDoAnoPage />} />
          <Route path="/financeiro/boletos" element={<BoletosPage />} />
          <Route path="/financeiro/auditoria-boletos" element={<AuditoriaBoletosPage />} />
          <Route path="/inventario" element={<InventarioPage />} />

          <Route path="/pasta-auditoria/cacau-show" element={<PastaAuditoriaCSPage />} />
          <Route path="/pasta-auditoria/faca-amigos" element={<PastaAuditoriaFAPage />} />

          <Route path="/rh" element={<RhModuloPage />} />
          <Route path="/ponto" element={<ControlePontoPage />} />
          <Route path="/meta-hora-hora" element={<MetaHoraHoraPage />} />

          <Route path="/pos-visita" element={<PosVisitaPage />} />
          <Route path="/aniversarios" element={<AniversariosPage />} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />

          <Route path="/" element={<DefaultRedirect />} />
        </Route>
      </Route>

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}
