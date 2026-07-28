import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Select from '../../components/ui/Select.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL } from '../../lib/format.js';
import { LOJAS_CACAU_SHOW, getLojaNomePorCodigo, useBoletos, useNfs } from '../../hooks/useFinanceiro.js';

const TOLERANCIA = 0.05;

const STATUS_BADGE = {
  OK: 'concluido',
  Conciliado: 'concluido',
  'Conciliado por Valor': 'atencao',
  'Loja Divergente': 'atencao',
  'Divergência de Valor': 'urgente',
  'Divergência de Parcela': 'urgente',
  'Sem NF-e': 'neutro',
  'Sem Boleto': 'neutro',
};

/**
 * Reconciliação NF-e x Boletos, portada de window.carregarAuditoriaBoletos /
 * conciliarOrfaosPorValor em webapp/app.js. Não existe endpoint dedicado —
 * o cruzamento é feito 100% no cliente a partir de GET /api/boletos e
 * GET /api/nfs (que já traz as duplicatas de cobrança da NF-e em info.duplicatas).
 */
function montarAuditoria(boletos, nfs) {
  const boletosAgrupados = {};
  boletos.forEach((b) => {
    let baseDoc;
    if (b.docFaturamento) {
      baseDoc = b.docFaturamento.split('-')[0].trim().replace(/^0+/, '') || '0';
    } else {
      baseDoc = (b.documento || '').split('-')[0].trim();
    }
    const groupKey = `${baseDoc}_${b.loja}`;
    if (!boletosAgrupados[groupKey]) {
      boletosAgrupados[groupKey] = { baseDoc, groupKey, loja: b.loja, valorTotal: 0, boletosRef: [] };
    }
    boletosAgrupados[groupKey].valorTotal += Number(b.valor || 0);
    boletosAgrupados[groupKey].boletosRef.push(b);
  });

  const auditMap = {};
  Object.values(boletosAgrupados).forEach((group) => {
    auditMap[group.groupKey] = { baseDoc: group.baseDoc, groupKey: group.groupKey, boletosGroup: group, nfeRef: null, loja: group.loja };
  });

  nfs.forEach((nf) => {
    const targetStore = nf.info?.targetStore || '9175';
    const nNF = nf.numero;
    const groupKey = `${nNF}_${targetStore}`;
    if (!auditMap[groupKey]) {
      auditMap[groupKey] = { baseDoc: nNF, groupKey, boletosGroup: null, nfeRef: nf, loja: targetStore };
    } else {
      auditMap[groupKey].nfeRef = nf;
    }
  });

  const auditList = Object.values(auditMap).map((item) => {
    const nfe = item.nfeRef;
    const bg = item.boletosGroup;
    let valorNfe = 0;
    let valorBoletos = 0;
    let statusText = 'OK';
    let descDivergencia = '';

    if (nfe) valorNfe = nfe.info?.valorTotal || 0;
    if (bg) valorBoletos = bg.valorTotal;

    if (nfe && bg) {
      const duplicatas = nfe.info?.duplicatas || [];
      if (duplicatas.length > 0) {
        const disponiveis = bg.boletosRef.slice();
        const problemas = [];
        duplicatas.forEach((dup) => {
          let idx = disponiveis.findIndex((b) => {
            const sufixo = ((b.documento || '').split('-')[1] || '').replace(/^0+/, '');
            const nDupLimpo = (dup.nDup || '').replace(/^0+/, '');
            return sufixo && nDupLimpo && sufixo === nDupLimpo;
          });
          if (idx === -1 && disponiveis.length > 0) {
            idx = disponiveis.reduce((melhorIdx, b, i) => {
              const diffAtual = Math.abs(b.valor - dup.valor);
              const diffMelhor = melhorIdx === -1 ? Infinity : Math.abs(disponiveis[melhorIdx].valor - dup.valor);
              return diffAtual < diffMelhor ? i : melhorIdx;
            }, -1);
          }
          if (idx === -1) {
            problemas.push(`Parcela ${dup.nDup || '—'} (${formatBRL(dup.valor)}): sem boleto correspondente`);
            return;
          }
          const pareado = disponiveis[idx];
          disponiveis.splice(idx, 1);
          const valorDivergente = Math.abs(pareado.valor - dup.valor) > TOLERANCIA;
          const vencDivergente = !!dup.vencimento && pareado.vencimento !== dup.vencimento;
          if (valorDivergente || vencDivergente) {
            const partes = [];
            if (vencDivergente) partes.push(`vencimento NF-e ${dup.vencimento} != boleto ${pareado.vencimento}`);
            if (valorDivergente) partes.push(`valor NF-e ${formatBRL(dup.valor)} != boleto ${formatBRL(pareado.valor)}`);
            problemas.push(`Doc. ${pareado.documento}: ${partes.join(' e ')}`);
          }
        });
        if (problemas.length > 0) {
          statusText = duplicatas.length > 1 ? 'Divergência de Parcela' : 'Divergência de Valor';
          descDivergencia = problemas.join(' | ');
        } else {
          statusText = 'Conciliado';
        }
      } else if (Math.abs(valorNfe - valorBoletos) > TOLERANCIA) {
        statusText = 'Divergência de Valor';
        descDivergencia = `NF-e ${formatBRL(valorNfe)} != Boletos ${formatBRL(valorBoletos)}`;
      } else {
        statusText = 'Conciliado';
      }
    } else if (bg && !nfe) {
      statusText = 'Sem NF-e';
    } else if (nfe && !bg) {
      statusText = 'Sem Boleto';
    }

    return {
      ...item,
      nfeNumber: nfe?.numero || null,
      valorNfe,
      valorBoletos,
      statusText,
      descDivergencia,
    };
  });

  // Segunda passada: pareia por valor as sobras "Sem NF-e" / "Sem Boleto" da
  // mesma loja (o documento não bate mas o valor sim — costuma ser diferença
  // entre "Doc. Faturamento" do relatório de títulos e o nNF do XML).
  const boletosOrfaos = auditList.filter((i) => i.statusText === 'Sem NF-e');
  const nfesOrfas = auditList.filter((i) => i.statusText === 'Sem Boleto');
  const pareadas = new Set();
  boletosOrfaos.forEach((boleto) => {
    const nfe = nfesOrfas.find((n) => !pareadas.has(n) && n.loja === boleto.loja && Math.abs(n.valorNfe - boleto.valorBoletos) <= TOLERANCIA);
    if (!nfe) return;
    pareadas.add(nfe);
    boleto.nfeNumber = nfe.nfeNumber;
    boleto.valorNfe = nfe.valorNfe;
    boleto.statusText = 'Conciliado por Valor';
    boleto.descDivergencia = 'Pareado por valor (documento não confere) — revisar';
  });

  return auditList.filter((item) => !pareadas.has(item));
}

export default function AuditoriaBoletosPage() {
  const boletosQuery = useBoletos();
  const nfsQuery = useNfs();
  const [lojaFiltro, setLojaFiltro] = useState('all');

  const auditList = useMemo(
    () => montarAuditoria(boletosQuery.data || [], nfsQuery.data || []),
    [boletosQuery.data, nfsQuery.data]
  );

  const filtrada = useMemo(
    () => (lojaFiltro === 'all' ? auditList : auditList.filter((i) => i.loja === lojaFiltro)),
    [auditList, lojaFiltro]
  );

  const totais = useMemo(() => {
    const totalNfe = filtrada.reduce((acc, i) => acc + (i.valorNfe || 0), 0);
    const totalBoletos = filtrada.reduce((acc, i) => acc + (i.valorBoletos || 0), 0);
    const divergencias = filtrada.filter((i) => i.statusText.startsWith('Divergência') || i.statusText === 'Loja Divergente').length;
    return { totalNfe, totalBoletos, divergencias };
  }, [filtrada]);

  const carregando = boletosQuery.isLoading || nfsQuery.isLoading;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Auditoria de Boletos</h1>
        <p className="text-sm text-slate-500 mt-1">Cruzamento entre NF-e importadas e boletos, agrupados por documento/loja.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total NF-e auditado" value={formatBRL(totais.totalNfe)} icon={ShieldCheck} gradient="blue" />
        <StatCard label="Total Boletos auditado" value={formatBRL(totais.totalBoletos)} icon={ShieldCheck} gradient="emerald" />
        <StatCard label="Divergências" value={totais.divergencias} icon={ShieldCheck} gradient="rose" />
      </div>

      <Card>
        <CardHeader
          title="Documentos"
          action={
            <Select className="md:w-56" value={lojaFiltro} onChange={(e) => setLojaFiltro(e.target.value)}>
              <option value="all">Todas as lojas</option>
              {LOJAS_CACAU_SHOW.map((l) => (
                <option key={l.codigo} value={l.codigo}>
                  {l.nome}
                </option>
              ))}
            </Select>
          }
        />

        {carregando ? (
          <LoadingBlock label="Cruzando NF-e e boletos..." />
        ) : filtrada.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Nada para auditar" description="Importe NF-e e boletos para ver o cruzamento aqui." />
        ) : (
          <Table columns={['Documento', 'Loja', 'NF-e', 'Valor NF-e', 'Valor Boletos', 'Status', 'Observação']}>
            {filtrada.map((item) => (
              <Tr key={item.groupKey}>
                <Td>{item.baseDoc}</Td>
                <Td>{getLojaNomePorCodigo(item.loja)}</Td>
                <Td>{item.nfeNumber || '—'}</Td>
                <Td>{formatBRL(item.valorNfe)}</Td>
                <Td>{formatBRL(item.valorBoletos)}</Td>
                <Td>
                  <Badge status={STATUS_BADGE[item.statusText] || 'neutro'}>{item.statusText}</Badge>
                </Td>
                <Td className="whitespace-normal max-w-sm text-xs text-slate-500">{item.descDivergencia}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
