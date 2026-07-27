import { useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Send, X } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import FileDropzone from '../../components/FileDropzone.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import { Label } from '../../components/ui/Input.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { formatBRL, formatDate } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { LOJAS_CACAU_SHOW } from '../../hooks/useFinanceiro.js';
import { useImportarMetasLojas } from '../../hooks/useMetasLojas.js';

/**
 * A célula de data da planilha de metas costuma vir como serial do Excel
 * mesmo com `cellDates: true`. Aceita serial, Date e string dd/mm/aaaa.
 * Portado de normalizarDataPlanilha em webapp/app.js.
 */
function normalizarDataPlanilha(cell) {
  if (cell === undefined || cell === null || cell === '') return null;
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (cell instanceof Date) return fmt(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());

  if (typeof cell === 'number' && cell > 0) {
    const partes = XLSX.SSF.parse_date_code(cell);
    if (!partes || !partes.y) return null;
    return fmt(partes.y, partes.m, partes.d);
  }

  const texto = cell.toString().trim();
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return fmt(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fmt(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/** Portado de parseMetasXlsx em webapp/app.js. */
function parseMetasXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        let headerRowIndex = -1;
        let colData = -1;
        let colMetaTotal = -1;
        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r] || [];
          const idxData = row.findIndex((v) => (v || '').toString().trim() === 'Data');
          const idxMeta = row.findIndex((v) => (v || '').toString().trim() === '$ Meta Total');
          if (idxData !== -1 && idxMeta !== -1) {
            headerRowIndex = r;
            colData = idxData;
            colMetaTotal = idxMeta;
            break;
          }
        }

        if (headerRowIndex === -1) {
          reject(new Error('Não foi possível localizar as colunas "Data" e "$ Meta Total" na planilha.'));
          return;
        }

        const brutos = [];
        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r] || [];
          const dataStr = normalizarDataPlanilha(row[colData]);
          const valorCell = row[colMetaTotal];
          if (!dataStr || valorCell === undefined || valorCell === null || valorCell === '') continue;
          const valor = parseFloat(valorCell);
          if (Number.isNaN(valor)) continue;
          brutos.push({ data: dataStr, valor, competencia: dataStr.slice(0, 7) });
        }

        if (brutos.length === 0) {
          reject(new Error('Nenhuma linha com Data e Meta Total válidas foi encontrada.'));
          return;
        }

        const contagemPorMes = {};
        brutos.forEach((l) => {
          contagemPorMes[l.competencia] = (contagemPorMes[l.competencia] || 0) + 1;
        });
        const linhas = brutos.map((l) => ({
          data: l.data,
          valor: l.valor,
          origem: contagemPorMes[l.competencia] > 1 ? 'diaria' : 'mensal',
        }));

        resolve(linhas);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export default function ImportarMetasPage() {
  const usuario = getCurrentUser()?.nome;
  const [loja, setLoja] = useState(LOJAS_CACAU_SHOW[0].nome);
  const [erro, setErro] = useState(null);
  const [linhas, setLinhas] = useState(null);
  const importarMetas = useImportarMetasLojas();

  async function handleFile(file) {
    setErro(null);
    setLinhas(null);
    try {
      const resultado = await parseMetasXlsxFile(file);
      setLinhas(resultado);
    } catch (err) {
      setErro(err.message || 'Erro ao processar a planilha de metas.');
    }
  }

  function confirmar() {
    if (!linhas) return;
    importarMetas.mutate(
      { loja, linhas, usuario },
      {
        onSuccess: () => {
          const diarias = linhas.filter((l) => l.origem === 'diaria').length;
          const mesesSoTotal = new Set(linhas.filter((l) => l.origem === 'mensal').map((l) => l.data.slice(0, 7))).size;
          toast.success(
            `Metas de ${loja} importadas! ${diarias} dia(s) como meta diária` +
              (mesesSoTotal > 0 ? `, ${mesesSoTotal} mês(es) só com total mensal.` : '.')
          );
          setLinhas(null);
        },
        onError: (err) => toast.error(err.message || 'Erro ao importar as metas.'),
      }
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Importar Metas Diárias</h1>
        <p className="text-sm text-slate-500 mt-1">
          Envie a planilha de exportação da loja (colunas "Data" e "$ Meta Total") para alimentar o Meta Hora a Hora.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="max-w-xs">
          <Label>Loja</Label>
          <Select value={loja} onChange={(e) => setLoja(e.target.value)}>
            {LOJAS_CACAU_SHOW.map((l) => (
              <option key={l.codigo} value={l.nome}>
                {l.nome}
              </option>
            ))}
          </Select>
        </div>

        <FileDropzone accept=".xlsx" label="Arraste a planilha de metas ou clique para selecionar" hint="Somente arquivos .xlsx" onFile={handleFile} />
        {erro && <p className="text-sm text-rose-600 font-bold">{erro}</p>}
      </Card>

      {linhas && (
        <Card className="space-y-4">
          <CardHeader
            title={`${linhas.length} linha(s) encontrada(s)`}
            subtitle={`Loja: ${loja}`}
            action={
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setLinhas(null)}>
                <X size={20} />
              </button>
            }
          />

          <Table columns={[{ label: 'Data' }, { label: 'Meta' }, { label: 'Origem' }]}>
            {linhas.map((l) => (
              <Tr key={l.data}>
                <Td>{formatDate(l.data)}</Td>
                <Td>{formatBRL(l.valor)}</Td>
                <Td>
                  <Badge status={l.origem === 'diaria' ? 'info' : 'neutro'}>{l.origem === 'diaria' ? 'Diária' : 'Total do Mês'}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLinhas(null)} disabled={importarMetas.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={importarMetas.isPending}>
              <Send size={16} />
              {importarMetas.isPending ? 'Enviando...' : 'Confirmar Importação'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
