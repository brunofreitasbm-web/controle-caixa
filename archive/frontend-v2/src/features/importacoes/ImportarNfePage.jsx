import { useState } from 'react';
import { toast } from 'sonner';
import { PackageSearch, Send, X } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import FileDropzone from '../../components/FileDropzone.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import { Label } from '../../components/ui/Input.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { LOJAS_CACAU_SHOW, detectStoreFromText, useImportarNfe } from '../../hooks/useFinanceiro.js';

/** Detecta múltiplo de caixa (CX/FD/DISPLAY) na descrição/unidade do item,
 * portado de detectBoxMultiplier em webapp/app.js. */
function detectBoxMultiplier(detElement, xProdText) {
  const uComEl = detElement.querySelector('uCom');
  const uCom = uComEl ? uComEl.textContent.toUpperCase() : '';
  const qComEl = detElement.querySelector('qCom');
  const qCom = qComEl ? parseFloat(qComEl.textContent) : 1;
  const qTribEl = detElement.querySelector('qTrib');
  const qTrib = qTribEl ? parseFloat(qTribEl.textContent) : 1;

  if ((uCom.includes('CX') || uCom.includes('BOX') || uCom.includes('FD')) && qTrib > qCom && qCom > 0) {
    return Math.round(qTrib / qCom);
  }

  const desc = xProdText.toUpperCase();
  const match = desc.match(/(?:CX|FD|C\/|BOX|DISP|DISPLAY)\s*(\d+)/i);
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    if (val > 1) return val;
  }
  return 1;
}

/** Portado de parseXmlNfe em webapp/app.js — mesma extração de campos, sem
 * as dependências de localStorage/currentStore que só existiam no app antigo. */
function parseXmlNfeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
        if (xmlDoc.querySelector('parsererror')) {
          reject(new Error('XML inválido ou corrompido.'));
          return;
        }

        const q = (sel) => xmlDoc.querySelector(sel);
        const nNF = q('nNF') ? q('nNF').textContent.trim() : `NF-${Date.now().toString().slice(-5)}`;
        const dhEmi = q('dhEmi') ? q('dhEmi').textContent : q('dEmi') ? q('dEmi').textContent : '';
        const qVol = q('qVol') ? q('qVol').textContent : '1';
        const xNomeEmit = q('emit > xNome') ? q('emit > xNome').textContent : 'Cacau Show CD';
        const xNomeDest = q('dest > xNome') ? q('dest > xNome').textContent : '';
        const cnpjDest = q('dest > CNPJ') ? q('dest > CNPJ').textContent : '';

        const storeDetectada = detectStoreFromText(`${xNomeDest} ${cnpjDest}`);
        const targetStore = storeDetectada || LOJAS_CACAU_SHOW[0].codigo;

        const duplicatas = [];
        xmlDoc.querySelectorAll('cobr > dup').forEach((dup) => {
          const nDup = dup.querySelector('nDup') ? dup.querySelector('nDup').textContent.trim() : '';
          const dVencRaw = dup.querySelector('dVenc') ? dup.querySelector('dVenc').textContent.trim() : '';
          const vDupRaw = dup.querySelector('vDup') ? dup.querySelector('vDup').textContent.trim() : '';
          if (!nDup && !dVencRaw && !vDupRaw) return;

          let vencimentoFormatado = '';
          if (dVencRaw) {
            const dVencDate = new Date(dVencRaw + 'T12:00:00');
            vencimentoFormatado = !Number.isNaN(dVencDate.getTime()) ? dVencDate.toLocaleDateString('pt-BR') : dVencRaw;
          }
          duplicatas.push({ nDup, vencimento: vencimentoFormatado, valor: parseFloat(vDupRaw) || 0 });
        });

        const vNFEl = q('total > ICMSTot > vNF') || q('vNF');
        const valorTotal = vNFEl ? parseFloat(vNFEl.textContent) : 0;

        let formattedDate = '-';
        if (dhEmi) {
          const d = new Date(dhEmi);
          if (!Number.isNaN(d.getTime())) formattedDate = d.toLocaleDateString('pt-BR');
        }

        const info = {
          numero: nNF,
          emissao: formattedDate,
          volumes: qVol,
          fornecedor: xNomeEmit,
          destinatario: xNomeDest,
          targetStore,
          storeAutoDetectada: !!storeDetectada,
          valorTotal,
          duplicatas,
        };

        const products = [];
        xmlDoc.querySelectorAll('det').forEach((det, idx) => {
          const cProd = det.querySelector('cProd') ? det.querySelector('cProd').textContent.trim() : `ITEM-${idx + 1}`;
          const cEAN = det.querySelector('cEAN') ? det.querySelector('cEAN').textContent.trim() : '';
          const xProd = det.querySelector('xProd') ? det.querySelector('xProd').textContent.trim() : 'Produto Desconhecido';
          const qCom = det.querySelector('qCom') ? parseFloat(det.querySelector('qCom').textContent) : 0;

          const boxMultiplier = detectBoxMultiplier(det, xProd);
          const totalUnits = Math.round(qCom * boxMultiplier);

          let validade = null;
          const dVal = det.querySelector('dVal');
          if (dVal && dVal.textContent) validade = new Date(dVal.textContent + 'T12:00:00').toISOString();

          const cod7Digitos = cProd.replace(/\D/g, '').padStart(7, '0').slice(-7) || cProd;

          products.push({
            code: cod7Digitos,
            barras: cEAN && cEAN !== 'SEM GTIN' ? cEAN : '',
            description: xProd,
            nfQty: qCom,
            boxMultiplier,
            totalUnits,
            countedQty: '',
            validade,
          });
        });

        if (products.length === 0) {
          reject(new Error('Nenhum produto (<det>) encontrado no XML. Confira se é uma NF-e válida.'));
          return;
        }

        resolve({ info, products });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}

export default function ImportarNfePage() {
  const usuario = getCurrentUser()?.nome;
  const [parseando, setParseando] = useState(false);
  const [erro, setErro] = useState(null);
  const [parsed, setParsed] = useState(null);
  const importarNfe = useImportarNfe();

  async function handleFile(file) {
    setErro(null);
    setParsed(null);
    setParseando(true);
    try {
      const resultado = await parseXmlNfeFile(file);
      setParsed(resultado);
      if (!resultado.info.storeAutoDetectada) {
        toast.warning(`NF-e Nº ${resultado.info.numero}: loja de destino não identificada pelo destinatário/CNPJ. Confira a loja antes de enviar.`);
      }
    } catch (err) {
      setErro(err.message || 'Erro ao processar o XML.');
    } finally {
      setParseando(false);
    }
  }

  function atualizarLoja(codigo) {
    setParsed((prev) => (prev ? { ...prev, info: { ...prev.info, targetStore: codigo } } : prev));
  }

  function confirmar() {
    if (!parsed) return;
    importarNfe.mutate(
      { numero: parsed.info.numero, info: parsed.info, products: parsed.products, usuario },
      {
        onSuccess: () => {
          toast.success(`NF-e Nº ${parsed.info.numero} importada com sucesso!`);
          setParsed(null);
        },
        onError: (err) => {
          if (err.message === 'duplicated') {
            toast.warning('Esta NF-e já foi importada anteriormente.');
          } else {
            toast.error(err.message || 'Erro ao importar a NF-e.');
          }
        },
      }
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Importar NF-e</h1>
        <p className="text-sm text-slate-500 mt-1">Envie o XML da nota fiscal para extrair os produtos automaticamente.</p>
      </div>

      <Card>
        <FileDropzone
          accept=".xml"
          label="Arraste o XML da NF-e ou clique para selecionar"
          hint="Somente arquivos .xml emitidos pelo CD Cacau Show"
          onFile={handleFile}
        />
        {erro && <p className="text-sm text-rose-600 font-bold mt-3">{erro}</p>}
      </Card>

      {parseando && (
        <Card>
          <LoadingBlock label="Lendo o XML..." />
        </Card>
      )}

      {parsed && (
        <Card className="space-y-4">
          <CardHeader
            title={`NF-e Nº ${parsed.info.numero}`}
            subtitle={`${parsed.products.length} produto(s) encontrado(s)`}
            action={
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setParsed(null)}>
                <X size={20} />
              </button>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Emissão</p>
              <p className="font-bold text-slate-800">{parsed.info.emissao}</p>
            </div>
            <div>
              <p className="text-slate-500">Fornecedor</p>
              <p className="font-bold text-slate-800">{parsed.info.fornecedor}</p>
            </div>
            <div>
              <p className="text-slate-500">Valor Total</p>
              <p className="font-bold text-slate-800">{formatBRL(parsed.info.valorTotal)}</p>
            </div>
            <div>
              <p className="text-slate-500">Volumes</p>
              <p className="font-bold text-slate-800">{parsed.info.volumes}</p>
            </div>
          </div>

          <div className="max-w-xs">
            <Label>
              Loja de destino
              {!parsed.info.storeAutoDetectada && (
                <Badge status="atencao" className="ml-2">
                  não detectada
                </Badge>
              )}
            </Label>
            <Select value={parsed.info.targetStore} onChange={(e) => atualizarLoja(e.target.value)}>
              {LOJAS_CACAU_SHOW.map((l) => (
                <option key={l.codigo} value={l.codigo}>
                  {l.nome}
                </option>
              ))}
            </Select>
          </div>

          <Table columns={['Código', 'Produto', 'Qtd. Faturada', 'Múltiplo', 'Total Unidades']}>
            {parsed.products.map((p) => (
              <Tr key={p.code}>
                <Td>{p.code}</Td>
                <Td className="whitespace-normal max-w-xs">{p.description}</Td>
                <Td>{p.nfQty}</Td>
                <Td>{p.boxMultiplier}x</Td>
                <Td>{p.totalUnits}</Td>
              </Tr>
            ))}
          </Table>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setParsed(null)} disabled={importarNfe.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={importarNfe.isPending}>
              <Send size={16} />
              {importarNfe.isPending ? 'Enviando...' : 'Confirmar Importação'}
            </Button>
          </div>
        </Card>
      )}

      {!parsed && !parseando && (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <PackageSearch size={18} />
          <span>Nenhum arquivo carregado ainda.</span>
        </div>
      )}
    </div>
  );
}
