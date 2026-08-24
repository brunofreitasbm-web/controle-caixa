import React from 'react';
import { 
  TrendingUp, 
  Store, 
  DollarSign, 
  Award, 
  ArrowUpRight, 
  ArrowDownRight,
  Download,
  Calendar,
  Filter
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import './Dashboard.css';

const chartData = [
  { month: 'Jan', faturamento: 420000, royalties: 25200 },
  { month: 'Fev', faturamento: 450000, royalties: 27000 },
  { month: 'Mar', faturamento: 480000, royalties: 28800 },
  { month: 'Abr', faturamento: 520000, royalties: 31200 },
  { month: 'Mai', faturamento: 610000, royalties: 36600 },
  { month: 'Jun', faturamento: 590000, royalties: 35400 },
  { month: 'Jul', faturamento: 680000, royalties: 40800 },
  { month: 'Ago', faturamento: 740000, royalties: 44400 },
];

const topFranchises = [
  { id: 1, name: 'Ananindeua - Coqueiro', owner: 'Carlos Eduardo', revenue: 'R$ 142.500', growth: '+14%' },
  { id: 2, name: 'Belém - Umarizal', owner: 'Mariana Silva', revenue: 'R$ 128.900', growth: '+9%' },
  { id: 3, name: 'Castanhal - Centro', owner: 'Roberto Mendes', revenue: 'R$ 115.000', growth: '+18%' },
  { id: 4, name: 'Manaus - Adrianópolis', owner: 'Fernanda Rocha', revenue: 'R$ 98.400', growth: '+5%' },
  { id: 5, name: 'Macapá - Shopping', owner: 'Lucas Pinheiro', revenue: 'R$ 89.200', growth: '+11%' },
];

export function Dashboard() {
  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Dashboard Master</h1>
          <p>Visão consolidada do desempenho da rede de franquias.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary btn-sm">
            <Calendar size={15} />
            <span>Últimos 30 dias</span>
          </button>
          <button className="btn btn-primary btn-sm">
            <Download size={15} />
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-grid">
        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Faturamento Global da Rede</span>
            <div className="kpi-icon">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">R$ 740.000</span>
            <span className="kpi-trend positive">
              <ArrowUpRight size={16} /> +12.4%
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>vs R$ 658.000 no mês anterior</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Royalties Arrecadados (SaaS)</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--brand-primary-light)' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">R$ 44.400</span>
            <span className="kpi-trend positive">
              <ArrowUpRight size={16} /> +8.1%
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Calculado a 6% sobre faturamento</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Franquias Ativas</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-success-bg)', color: 'var(--accent-success)' }}>
              <Store size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">42</span>
            <span className="kpi-trend positive">
              <ArrowUpRight size={16} /> +3 este mês
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>98% de adimplência na rede</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Ticket Médio / Unidade</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-purple-bg)', color: 'var(--accent-purple)' }}>
              <Award size={20} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">R$ 17.619</span>
            <span className="kpi-trend positive">
              <ArrowUpRight size={16} /> +4.2%
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Média de vendas por franquia</p>
        </div>
      </div>

      {/* Main Charts & Rankings */}
      <div className="dashboard-charts-grid">
        <div className="card">
          <div className="chart-card-header">
            <div>
              <h3>Evolução de Faturamento da Rede</h3>
              <p style={{ fontSize: '0.8125rem' }}>Valores brutos em Reais (R$) nos últimos 8 meses</p>
            </div>
            <span className="badge badge-info">Atualizado hoje</span>
          </div>

          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(val) => `R$${val/1000}k`} />
                <Tooltip 
                  formatter={(val) => [`R$ ${val.toLocaleString()}`, 'Faturamento']}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Area type="monotone" dataKey="faturamento" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="chart-card-header">
            <div>
              <h3>Top Franquias</h3>
              <p style={{ fontSize: '0.8125rem' }}>Ranking por faturamento do mês</p>
            </div>
          </div>

          <div className="top-franchises-list">
            {topFranchises.map((item, index) => (
              <div key={item.id} className="franchise-rank-item">
                <div className="franchise-rank-info">
                  <div className={`rank-badge rank-${index + 1}`}>
                    {index + 1}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.owner}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block' }}>{item.revenue}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-success-text)', fontWeight: 600 }}>{item.growth}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
