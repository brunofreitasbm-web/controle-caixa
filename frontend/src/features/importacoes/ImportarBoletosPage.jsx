import { useState } from 'react';
import { toast } from 'sonner';
import { Send, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import FileDropzone from '../../components/FileDropzone.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { LOJAS_CACAU_SHOW, detectStoreFromText, useImportarBoletos } from '../../hooks/useFinanceiro.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

function uid() {
  return 'b-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

/** Portado de parseMoedaPdf em webapp/app.js. */
function parseMoedaPdf(str) {
  if (!str) return 0;
  let clean = str.replace(/[^\d.,]/g, '');
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  if (lastDot > lastComma) {
    clean = clean.replace(/,/g, '');
    return parseFloat(clean) || 0;
  }
  if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }
  return parseFloat(clean) || 0;
}

/**
 * Extrai os boletos do texto do relatório de "Consulta de Títulos" (portal
 * Cacau Digital), usando a posição (x/y) de cada item de texto na página do
 * PDF. Portado fielmente de extrairBoletosDoTexto em webapp/app.js — o
 * relatório é uma página web impressa em PDF, então uma linha da tabela às
 * vezes quebra em várias linhas de texto internas; por isso os blocos são
 * ancorados pelo "Número Doc." (10 dígitos + sufixo), que é estável.
 */
function extrairBoletosDoTexto(items, fullText) {
  const boletosExtraidos = [];
  const lojaDoRelatorio = detectStoreFromText(fullText);

  const pages = [...new Set(items.map((item) => item.page))];

  pages.forEach((pageNum) => {
    const pageItems = items.filter((item) => item.page === pageNum);

    const prefixItems = pageItems.filter((item) => item.x >= 38 && item.x <= 46 && /^\d{9,10}-?$/.test(item.str));
    prefixItems.sort((a, b) => b.y - a.y);

    const rows = prefixItems.map((prefix, idx) => {
      const topBoundary = prefix.y + 20.0;
      const bottomBoundary = idx + 1 < prefixItems.length ? prefixItems[idx + 1].y : 0.0;
      return { prefix, topBoundary, bottomBoundary, items: [] };
    });

    pageItems.forEach((item) => {
      const row = rows.find((r) => item.y > r.bottomBoundary && item.y <= r.topBoundary);
      if (row) row.items.push(item);
    });

    rows.forEach((row) => {
      row.items.sort((a, b) => a.x - b.x);
      const prefixItem = row.prefix;

      const suffixItem = row.items.find(
        (item) => item.x > prefixItem.x && item.x < 70 && (/^\d{3}$/.test(item.str) || /^[A-Z]{2,3}$/.test(item.str))
      );

      let documento = prefixItem.str;
      if (suffixItem) {
        const cleanPrefix = prefixItem.str.endsWith('-') ? prefixItem.str.slice(0, -1) : prefixItem.str;
        documento = `${cleanPrefix}-${suffixItem.str}`;
      }

      const isDebito = row.items.some((item) => /d[eé]bito/i.test(item.str));
      if (!isDebito) return;

      const dateItem = row.items.find((item) => /^\b\d{2}\/\d{2}\/\d{2,4}\b$/.test(item.str));
      if (!dateItem) return;

      let vencimento = dateItem.str;
      const dateParts = vencimento.split('/');
      if (dateParts[2].length === 2) vencimento = `${dateParts[0]}/${dateParts[1]}/20${dateParts[2]}`;

      const valorItems = row.items.filter((item) => item.x >= 480 && item.x <= 515);
      const valorStr = valorItems.map((vi) => vi.str).join(' ').trim();
      const valor = parseMoedaPdf(valorStr);
      if (!valor) return;

      const docFatPrefixItem = row.items.find((item) => item.x >= 370 && item.x <= 395 && /^\d{6,9}-$/.test(item.str));
      let docFaturamento = null;
      if (docFatPrefixItem) {
        const docFatSuffixItem = row.items.find((item) => item.x > docFatPrefixItem.x && item.x < 420 && /^\d{3}$/.test(item.str));
        if (docFatSuffixItem) docFaturamento = `${docFatPrefixItem.str}${docFatSuffixItem.str}`;
      }

      const parcelaItem = row.items.find((item) => item.x >= 300 && item.x <= 330 && /^\d+\/\d+$/.test(item.str));
      const parcela = parcelaItem ? parcelaItem.str : '1/1';

      const rowText = row.items.map((item) => item.str).join(' ');
      const lojaNoBloco = detectStoreFromText(rowText);
      const loja = lojaNoBloco || lojaDoRelatorio || LOJAS_CACAU_SHOW[0].codigo;
      const lojaAutoDetectada = !!(lojaNoBloco || lojaDoRelatorio);

      const descItems = row.items.filter((item) => item.x >= 185 && item.x < 300);
      let descricao = descItems.map((item) => item.str).join(' ').trim();
      if (!descricao) descricao = 'Duplicata Cacau Show';

      boletosExtraidos.push({
        id: uid(),
        documento,
        docFaturamento,
        parcela,
        loja,
        lojaAutoDetectada,
        descricao,
        vencimento,
        valor,
        status: 'Aberto',
      });
    });
  });

  return boletosExtraidos;
}

async function parseBoletoPdfFile(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems = [];
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(Math.round((i / pdf.numPages) * 100));
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();

    const pageItems = text.items
      .map((item) => ({
        str: item.str,
        x: Math.round(item.transform[4] * 10) / 10,
        y: Math.round(item.transform[5] * 10) / 10,
        page: i,
      }))
      .filter((item) => item.str.trim() !== '');

    allItems.push(...pageItems);
    fullText += text.items.map((item) => item.str).join(' ') + '\n';
  }

  return extrairBoletosDoTexto(allItems, fullText);
}

export default function ImportarBoletosPage() {
  const usuario = getCurrentUser()?.nome;
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState(null);
  const [boletos, setBoletos] = useState(null);
  const importarBoletos = useImportarBoletos();

  async function handleFile(file) {
    setErro(null);
    setBoletos(null);
    setProcessando(true);
    setProgresso(0);
    try {
      const extraidos = await parseBoletoPdfFile(file, setProgresso);
      if (extraidos.length === 0) {
        setErro('Não foi possível identificar boletos no formato do arquivo. Confira se é o relatório de "Consulta de Títulos" do portal Cacau Digital.');
        return;
      }
      setBoletos(extraidos);
      const semLoja = extraidos.filter((b) => !b.lojaAutoDetectada).length;
      if (semLoja > 0) {
        toast.warning(`${semLoja} boleto(s) sem loja identificada no PDF — confira antes de enviar.`);
      }
    } catch (err) {
      console.error(err);
      setErro('Erro ao decodificar o arquivo PDF.');
    } finally {
      setProcessando(false);
    }
  }

  function atualizarLoja(id, codigo) {
    setBoletos((prev) => prev.map((b) => (b.id === id ? { ...b, loja: codigo } : b)));
  }

  function confirmar() {
    if (!boletos) return;
    importarBoletos.mutate(
      { boletos, usuario },
      {
        onSuccess: (data) => {
          const novos = data?.insertedCount || 0;
          const duplicados = data?.ignoredCount || 0;
          if (novos > 0 && duplicados > 0) {
            toast.info(`${novos} boletos importados. ${duplicados} duplicado(s) ignorado(s).`);
          } else if (novos === 0 && duplicados > 0) {
            toast.warning(`Nenhum boleto novo — todos os ${duplicados} já constavam no sistema.`);
          } else {
            toast.success(`${novos} boletos importados!`);
          }
          setBoletos(null);
        },
        onError: (err) => toast.error(err.message || 'Erro ao importar os boletos.'),
      }
    );
  }

  const totalValor = boletos ? boletos.reduce((acc, b) => acc + b.valor, 0) : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Importar Boletos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Envie o PDF do relatório de "Consulta de Títulos" (portal Cacau Digital) para extrair os boletos em aberto.
        </p>
      </div>

      <Card>
        <FileDropzone accept=".pdf" label="Arraste o PDF de títulos ou clique para selecionar" hint="Somente arquivos .pdf" onFile={handleFile} />
        {erro && <p className="text-sm text-rose-600 font-bold mt-3">{erro}</p>}
      </Card>

      {processando && (
        <Card>
          <LoadingBlock label={`Lendo páginas do PDF... ${progresso}%`} />
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progresso}%` }} />
          </div>
        </Card>
      )}

      {boletos && (
        <Card className="space-y-4">
          <CardHeader
            title={`${boletos.length} boleto(s) encontrado(s)`}
            subtitle={`Total: ${formatBRL(totalValor)}`}
            action={
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setBoletos(null)}>
                <X size={20} />
              </button>
            }
          />

          <Table columns={[{ label: 'Documento' }, { label: 'Loja' }, { label: 'Descrição' }, { label: 'Vencimento' }, { label: 'Valor' }]}>
            {boletos.map((b) => (
              <Tr key={b.id}>
                <Td>
                  {b.documento}
                  {!b.lojaAutoDetectada && (
                    <Badge status="atencao" className="ml-2">
                      confira a loja
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Select className="min-w-[9rem]" value={b.loja} onChange={(e) => atualizarLoja(b.id, e.target.value)}>
                    {LOJAS_CACAU_SHOW.map((l) => (
                      <option key={l.codigo} value={l.codigo}>
                        {l.nome}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="whitespace-normal max-w-xs">{b.descricao}</Td>
                <Td>{b.vencimento}</Td>
                <Td>{formatBRL(b.valor)}</Td>
              </Tr>
            ))}
          </Table>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBoletos(null)} disabled={importarBoletos.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={importarBoletos.isPending}>
              <Send size={16} />
              {importarBoletos.isPending ? 'Enviando...' : 'Confirmar Importação'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
