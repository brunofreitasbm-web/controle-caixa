import { api } from '../../lib/apiClient.js';

// ==========================================================================
// Perfis DISC — módulo RH, 100% client-side (sem tabela dedicada no backend).
//
// Persistência em duas camadas, replicando o comportamento do app antigo
// (webapp/app.js, seção "MÓDULO RH: GESTÃO DE PESSOAS & PERFIL DISC"):
//   1) localStorage, MESMA CHAVE do app antigo (`cacaushow_disc_profiles_v1`)
//      — para não perder o que já estava salvo no navegador de quem já usava
//      o sistema.
//   2) /api/config, chave genérica `disc_profiles_config` (JSON stringificado)
//      — MESMA chave que o app antigo já gravava via salvarConfigAPI(), então
//      perfis já sincronizados no servidor por qualquer dispositivo aparecem
//      aqui também. Como não há endpoint dedicado, reaproveitamos o
//      GET/POST /api/config genérico (a mesma tabela `configuracoes` que a
//      tela de Configurações edita).
// ==========================================================================

export const DISC_PROFILES_KEY = 'cacaushow_disc_profiles_v1';
export const DISC_CONFIG_CHAVE = 'disc_profiles_config';

export const DISC_COLORS = { d: '#ef4444', i: '#f59e0b', s: '#10b981', c: '#6366f1' };
export const DISC_LABELS = { d: 'Dominância', i: 'Influência', s: 'Estabilidade', c: 'Conformidade' };
export const DISC_PERFIL_POR_LETRA = { d: 'Dominante', i: 'Influenciador', s: 'Estável', c: 'Conforme' };
export const LETRA_POR_PERFIL = { Dominante: 'd', Influenciador: 'i', Estável: 's', Conforme: 'c' };

export const LOJAS_RH = {
  all: 'Todas as Lojas (Geral)',
  9175: '9175 - Marambaia',
  9201: '9201 - Mário Covas',
  4304: '4304 - Icoaraci',
  'fa-parque': 'Faça Amigos - Parque',
  'fa-playground': 'Faça Amigos - Playground',
  'fa-grao-para': 'Faça Amigos - Grão-Pará',
};

export const DEFAULT_DISC_PROFILES = {
  Bruno: { userName: 'Bruno', d: 85, i: 70, s: 40, c: 60, perfilPredominante: 'Dominante', dataAtualizacao: '2026-07-22' },
  Isabella: { userName: 'Isabella', d: 60, i: 80, s: 65, c: 75, perfilPredominante: 'Influenciador', dataAtualizacao: '2026-07-22' },
  Alexandra: { userName: 'Alexandra', d: 50, i: 75, s: 70, c: 80, perfilPredominante: 'Conforme', dataAtualizacao: '2026-07-22' },
};

export function loadDiscProfilesLocal() {
  try {
    const saved = localStorage.getItem(DISC_PROFILES_KEY);
    if (!saved) return DEFAULT_DISC_PROFILES;
    return JSON.parse(saved);
  } catch {
    return DEFAULT_DISC_PROFILES;
  }
}

export function saveDiscProfilesLocal(profiles) {
  localStorage.setItem(DISC_PROFILES_KEY, JSON.stringify(profiles));
}

// Busca no servidor primeiro (fonte compartilhada entre dispositivos); cai
// para o cache local se a API falhar ou ainda não tiver nada salvo lá.
export async function fetchDiscProfiles() {
  try {
    const config = await api.get('/api/config');
    if (config && config[DISC_CONFIG_CHAVE]) {
      const parsed = JSON.parse(config[DISC_CONFIG_CHAVE]);
      saveDiscProfilesLocal(parsed);
      return parsed;
    }
  } catch (err) {
    console.error('Erro ao buscar perfis DISC do servidor:', err);
  }
  return loadDiscProfilesLocal();
}

export async function persistDiscProfiles(profiles) {
  saveDiscProfilesLocal(profiles);
  await api.post('/api/config', { chave: DISC_CONFIG_CHAVE, valor: JSON.stringify(profiles) });
  return profiles;
}

// Funil único de leitura dos dados para Dashboard/Formação de Equipe —
// aplica o mesmo filtro de loja e de exclusão em todo lugar que consome a
// lista de colaboradores com perfil DISC.
export function obterPessoasFiltradas(profiles, colaboradores, filterStore) {
  return colaboradores.reduce((acc, c) => {
    const prof = profiles[c.nome];
    if (prof && prof.excludedFromRh) return acc;
    const store = prof?.store || 'all';
    if (filterStore !== 'all' && store !== 'all' && store !== filterStore) return acc;

    const d = prof ? prof.d || 0 : 25;
    const i = prof ? prof.i || 0 : 25;
    const s = prof ? prof.s || 0 : 25;
    const cVal = prof ? prof.c || 0 : 25;
    const perfilPredominante = prof ? prof.perfilPredominante : 'Equilibrado';
    acc.push({
      nome: c.nome,
      d,
      i,
      s,
      c: cVal,
      perfilPredominante,
      dominante: LETRA_POR_PERFIL[perfilPredominante] || null,
      store,
    });
    return acc;
  }, []);
}

export function calcularPerfilPredominante(d, i, s, c) {
  let perfilPredominante = 'Dominante';
  let max = d;
  if (i > max) {
    max = i;
    perfilPredominante = 'Influenciador';
  }
  if (s > max) {
    max = s;
    perfilPredominante = 'Estável';
  }
  if (c > max) {
    perfilPredominante = 'Conforme';
  }
  return perfilPredominante;
}

// Heurística de aptidão comercial: em vendas consultivas de varejo,
// Influência (rapport, venda de adicionais) pesa mais, seguida de Dominância
// (iniciativa pra abordar/fechar). Não é um veredito científico — é apoio de
// leitura rápida, sempre cruzar com desempenho real de vendas.
export function calcularAptidaoVendas(prof) {
  const score = Math.round((prof.i || 0) * 0.4 + (prof.d || 0) * 0.3 + (prof.s || 0) * 0.15 + (prof.c || 0) * 0.15);
  if (score >= 68) return { score, nivel: 'alto', label: 'Alto Potencial Comercial' };
  if (score >= 50) return { score, nivel: 'moderado', label: 'Potencial Comercial Moderado' };
  return { score, nivel: 'baixo', label: 'Perfil de Suporte/Backoffice' };
}

// Extrai valores D/I/S/C de um laudo de PDF já convertido em texto — procura
// primeiro na seção "Gráfico Resultante" (ou "Gráfico Estrutural" como
// fallback), com fallback final para a string inteira.
export function extrairValoresDisc(textContent) {
  let d = 25;
  let i = 25;
  let s = 25;
  let c = 25;

  let targetText = textContent;
  const idxResultante = textContent.toLowerCase().indexOf('gráfico resultante');
  if (idxResultante !== -1) {
    targetText = textContent.substring(idxResultante);
  } else {
    const idxEstrutural = textContent.toLowerCase().indexOf('gráfico estrutural');
    if (idxEstrutural !== -1) targetText = textContent.substring(idxEstrutural);
  }

  const dMatch = targetText.match(/(\d+)%\s*Dominância/i);
  const iMatch = targetText.match(/(\d+)%\s*Influência/i);
  const sMatch = targetText.match(/(\d+)%\s*Estabilidade/i);
  const cMatch = targetText.match(/(\d+)%\s*Conformidade/i);

  if (dMatch) d = parseInt(dMatch[1], 10);
  if (iMatch) i = parseInt(iMatch[1], 10);
  if (sMatch) s = parseInt(sMatch[1], 10);
  if (cMatch) c = parseInt(cMatch[1], 10);

  const dFull = textContent.match(/(\d+)%\s*Dominância/i);
  const iFull = textContent.match(/(\d+)%\s*Influência/i);
  const sFull = textContent.match(/(\d+)%\s*Estabilidade/i);
  const cFull = textContent.match(/(\d+)%\s*Conformidade/i);
  if (!dMatch && dFull) d = parseInt(dFull[1], 10);
  if (!iMatch && iFull) i = parseInt(iFull[1], 10);
  if (!sMatch && sFull) s = parseInt(sFull[1], 10);
  if (!cMatch && cFull) c = parseInt(cFull[1], 10);

  return { d, i, s, c, perfilPredominante: calcularPerfilPredominante(d, i, s, c) };
}

// Extrai nome do candidato/colaborador a partir do texto do laudo, ou do
// nome do arquivo como último recurso.
export function extrairNomeDoPdf(textContent, fileName) {
  const patterns = [
    /NOME\s*DOS?\s*AVALIADOS?[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /NOME\s*[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /NOME\s*DO\s*CLIENTE[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /RELATÓRIO\s*DE[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /CANDIDATO\s*[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /COLABORADOR\s*[:\s]+([A-ZÀ-Ú\s]{3,40})/i,
    /ANÁLISE\s*EXECUTIVA\s+([A-ZÀ-Ú\s]{3,40})/i,
    /SUMÁRIO\s+([A-ZÀ-Ú\s]{3,40})/i,
    /VISÃO\s*GERAL\s+([A-ZÀ-Ú\s]{3,40})/i,
  ];

  for (const regex of patterns) {
    const match = textContent.match(regex);
    if (match && match[1]) {
      const nomeLimpo = match[1].replace(/\r?\n|\r/g, ' ').trim();
      const partes = nomeLimpo.split(/\s+/).filter((p) => p.length > 1);
      if (partes.length >= 2) {
        return partes.slice(0, 3).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }
  }

  let cleanName = fileName.replace(/\.pdf$/i, '');
  cleanName = cleanName.replace(/disc/gi, '');
  cleanName = cleanName.replace(/[_\-+]/g, ' ').trim();
  const partesFile = cleanName.split(/\s+/).filter((p) => p.length > 1);
  if (partesFile.length >= 2) {
    return partesFile.slice(0, 3).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  return '';
}

let pdfjsPromise = null;
async function carregarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

// Extrai o texto completo de um arquivo PDF (laudo DISC) via pdfjs-dist.
export async function extrairTextoPdf(file) {
  const pdfjsLib = await carregarPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textContent = '';
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    textContent += content.items.map((item) => item.str).join(' ') + ' ';
  }
  return textContent;
}

// Processa um laudo em PDF de ponta a ponta: extrai texto, valores DISC e um
// nome sugerido (do texto do laudo ou do nome do arquivo).
export async function processarLaudoPdf(file) {
  const textContent = await extrairTextoPdf(file);
  const valores = extrairValoresDisc(textContent);
  const nomeDetectado = extrairNomeDoPdf(textContent, file.name);
  return { ...valores, nomeDetectado, textContent };
}
