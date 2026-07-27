import {
  LayoutDashboard,
  Wallet,
  History,
  CalendarRange,
  ShieldCheck,
  Users,
  Sparkles,
  Upload,
  FileCheck2,
  Boxes,
  Receipt,
  FolderLock,
  Brain,
  Fingerprint,
  TimerReset,
  Gift,
  MessageCircleHeart,
  Settings,
  Target,
} from 'lucide-react';
import { ROLES } from '../lib/auth.js';

const ALL = [ROLES.OWNER, ROLES.CONSULTORA, ROLES.CONSULTORA_DASHBOARD, ROLES.CONSULTORA_FA];
const CACAU_SHOW = [ROLES.OWNER, ROLES.CONSULTORA, ROLES.CONSULTORA_DASHBOARD];
const FACA_AMIGOS = [ROLES.OWNER, ROLES.CONSULTORA_FA];
const GESTAO = [ROLES.OWNER, ROLES.CONSULTORA_DASHBOARD];
const OWNER_ONLY = [ROLES.OWNER];

// Mesma rota/página nos dois subgrupos de negócio (1.1 e 1.2) — ver
// ControlePontoPage/getOperacoesParaUsuario, que já se adapta por role. Os
// roles aqui são escopados por subgrupo (em vez de ALL) para que o item não
// "vaze" um cabeçalho de subgrupo vazio para quem só tem acesso ao outro
// negócio (ex.: consultora_fa não deve ver um grupo "Cacau Show" contendo só
// o Ponto).
const PONTO_ITEM_CS = { path: '/ponto', label: 'Registro de Ponto', icon: Fingerprint, roles: CACAU_SHOW };
const PONTO_ITEM_FA = { path: '/ponto', label: 'Registro de Ponto', icon: Fingerprint, roles: FACA_AMIGOS };

export const NAV_GROUPS = [
  {
    title: null,
    items: [
      { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: GESTAO },
      { path: '/colaboradores', label: 'Colaboradores', icon: Users, roles: GESTAO },
      { path: '/auditoria', label: 'Auditoria de Ações', icon: ShieldCheck, roles: ALL, auditoriaOnly: true },
    ],
  },
  {
    title: 'Operações',
    collapsible: true,
    defaultOpen: true,
    subgroups: [
      {
        title: 'Cacau Show',
        items: [
          { path: '/caixa/registro', label: 'Caixa', icon: Wallet, roles: CACAU_SHOW },
          {
            path: '/caixa/dashboard',
            label: 'Dashboard CS',
            icon: LayoutDashboard,
            roles: CACAU_SHOW,
            children: [{ path: '/caixa/mensal', label: 'Dashboard Mensal', icon: CalendarRange, roles: CACAU_SHOW }],
          },
          { path: '/caixa/historico', label: 'Histórico', icon: History, roles: CACAU_SHOW },
          { path: '/meta-hora-hora', label: 'Meta Hora a Hora', icon: TimerReset, roles: CACAU_SHOW },
          { path: '/financeiro/meta-do-ano', label: 'Meta do Ano', icon: Target, roles: GESTAO },
          PONTO_ITEM_CS,
          { path: '/importacoes', label: 'Importações', icon: Upload, roles: GESTAO },
          { path: '/pasta-auditoria/cacau-show', label: 'Pasta de Auditoria', icon: FolderLock, roles: CACAU_SHOW },
          {
            path: '/financeiro/boletos',
            label: 'Boletos',
            icon: Receipt,
            roles: GESTAO,
            children: [{ path: '/financeiro/auditoria-boletos', label: 'Auditoria de Boletos', icon: ShieldCheck, roles: GESTAO }],
          },
          { path: '/financeiro/conferencia-nfe', label: 'Conferência de Notas', icon: FileCheck2, roles: CACAU_SHOW },
          { path: '/inventario', label: 'Inventários', icon: Boxes, roles: CACAU_SHOW },
        ],
      },
      {
        title: 'Faça Amigos',
        items: [
          { path: '/faca-amigos/registro', label: 'Caixa', icon: Wallet, roles: FACA_AMIGOS },
          {
            path: '/faca-amigos/dashboard',
            label: 'Dashboard FA',
            icon: LayoutDashboard,
            roles: FACA_AMIGOS,
            children: [{ path: '/faca-amigos/mensal', label: 'Dashboard Mensal', icon: CalendarRange, roles: FACA_AMIGOS }],
          },
          { path: '/faca-amigos/historico', label: 'Histórico', icon: History, roles: FACA_AMIGOS },
          { path: '/faca-amigos/meta', label: 'Meta', icon: Target, roles: FACA_AMIGOS },
          { path: '/faca-amigos/regras', label: 'Regras de Bonificação', icon: Settings, roles: OWNER_ONLY },
          { path: '/pos-visita', label: 'Pós-Visita', icon: MessageCircleHeart, roles: FACA_AMIGOS },
          { path: '/aniversarios', label: 'Aniversariantes', icon: Gift, roles: FACA_AMIGOS },
          PONTO_ITEM_FA,
          { path: '/pasta-auditoria/faca-amigos', label: 'Pasta de Documentação', icon: FolderLock, roles: FACA_AMIGOS },
        ],
      },
    ],
  },
  {
    title: 'DISC',
    items: [{ path: '/rh', label: 'DISC', icon: Brain, roles: OWNER_ONLY }],
  },
  {
    title: 'Insights IA',
    collapsible: true,
    defaultOpen: true,
    items: [
      { path: '/insights-ia/cacau-show', label: 'Cacau Show', icon: Sparkles, roles: GESTAO },
      { path: '/insights-ia/faca-amigos', label: 'Faça Amigos', icon: Sparkles, roles: GESTAO },
    ],
  },
];
