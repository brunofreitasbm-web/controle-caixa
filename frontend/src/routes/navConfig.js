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
  Store,
  Target,
} from 'lucide-react';
import { ROLES } from '../lib/auth.js';

const ALL = [ROLES.OWNER, ROLES.CONSULTORA, ROLES.CONSULTORA_DASHBOARD, ROLES.CONSULTORA_FA];
const CACAU_SHOW = [ROLES.OWNER, ROLES.CONSULTORA, ROLES.CONSULTORA_DASHBOARD];
const FACA_AMIGOS = [ROLES.OWNER, ROLES.CONSULTORA_FA];
const GESTAO = [ROLES.OWNER, ROLES.CONSULTORA_DASHBOARD];
const OWNER_ONLY = [ROLES.OWNER];

export const NAV_GROUPS = [
  {
    title: 'Cacau Show',
    items: [
      { path: '/caixa/registro', label: 'Registrar Envelope', icon: Wallet, roles: CACAU_SHOW },
      { path: '/caixa/dashboard', label: 'Dashboard de Envelopes', icon: LayoutDashboard, roles: CACAU_SHOW },
      { path: '/caixa/historico', label: 'Histórico', icon: History, roles: CACAU_SHOW },
      { path: '/caixa/mensal', label: 'Dashboard Mensal', icon: CalendarRange, roles: CACAU_SHOW },
      { path: '/auditoria', label: 'Auditoria de Ações', icon: ShieldCheck, roles: ALL, auditoriaOnly: true },
    ],
  },
  {
    title: 'Faça Amigos',
    items: [
      { path: '/faca-amigos/registro', label: 'Registrar Envelope', icon: Wallet, roles: FACA_AMIGOS },
      { path: '/faca-amigos/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: FACA_AMIGOS },
      { path: '/faca-amigos/historico', label: 'Histórico', icon: History, roles: FACA_AMIGOS },
      { path: '/faca-amigos/mensal', label: 'Dashboard Mensal', icon: CalendarRange, roles: FACA_AMIGOS },
      { path: '/faca-amigos/meta', label: 'Meta e Bonificação', icon: Target, roles: FACA_AMIGOS },
      { path: '/faca-amigos/regras', label: 'Regras de Bonificação', icon: Settings, roles: OWNER_ONLY },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { path: '/importacoes', label: 'Importações', icon: Upload, roles: GESTAO },
      { path: '/financeiro/conferencia-nfe', label: 'Conferência de NF-e', icon: FileCheck2, roles: CACAU_SHOW },
      { path: '/financeiro/meta-do-ano', label: 'Meta do Ano', icon: Target, roles: GESTAO },
      { path: '/financeiro/boletos', label: 'Boletos', icon: Receipt, roles: GESTAO },
      { path: '/financeiro/auditoria-boletos', label: 'Auditoria de Boletos', icon: ShieldCheck, roles: GESTAO },
      { path: '/inventario', label: 'Inventário de Estoque', icon: Boxes, roles: CACAU_SHOW },
    ],
  },
  {
    title: 'RH & Pessoas',
    items: [
      { path: '/colaboradores', label: 'Colaboradores', icon: Users, roles: GESTAO },
      { path: '/ponto', label: 'Controle de Ponto', icon: Fingerprint, roles: ALL },
      { path: '/meta-hora-hora', label: 'Meta Hora a Hora', icon: TimerReset, roles: CACAU_SHOW },
      { path: '/rh', label: 'Módulo RH (DISC)', icon: Brain, roles: OWNER_ONLY },
    ],
  },
  {
    title: 'Comunicação & Documentos',
    items: [
      { path: '/pos-visita', label: 'Pós-Visita', icon: MessageCircleHeart, roles: FACA_AMIGOS },
      { path: '/aniversarios', label: 'Aniversários', icon: Gift, roles: FACA_AMIGOS },
      { path: '/pasta-auditoria/cacau-show', label: 'Pasta de Auditoria — Cacau Show', icon: FolderLock, roles: CACAU_SHOW },
      { path: '/pasta-auditoria/faca-amigos', label: 'Pasta de Auditoria — Faça Amigos', icon: FolderLock, roles: FACA_AMIGOS },
    ],
  },
  {
    title: 'Inteligência & Configuração',
    items: [
      { path: '/insights-ia', label: 'Insights IA', icon: Sparkles, roles: GESTAO },
      { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: GESTAO },
    ],
  },
];

export const MODULOS = [
  { key: 'cacau-show', label: 'Cacau Show', description: 'Envelopes, dashboards e financeiro das lojas', icon: Store, gradient: 'blue', roles: CACAU_SHOW, home: '/caixa/dashboard' },
  { key: 'faca-amigos', label: 'Faça Amigos', description: 'Envelopes, metas e comunicação do playground', icon: Gift, gradient: 'emerald', roles: FACA_AMIGOS, home: '/faca-amigos/dashboard' },
  { key: 'rh', label: 'RH', description: 'Perfis DISC e formação de equipe', icon: Brain, gradient: 'amber', roles: OWNER_ONLY, home: '/rh' },
  { key: 'ponto', label: 'Ponto', description: 'Registro de ponto com biometria e GPS', icon: Fingerprint, gradient: 'rose', roles: ALL, home: '/ponto' },
];
