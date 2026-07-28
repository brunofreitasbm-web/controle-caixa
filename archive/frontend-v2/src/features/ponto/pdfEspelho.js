// Geração client-side da Folha/Espelho de Ponto em PDF — o backend
// (routes/ponto.js POST /folha-email) só recebe o PDF pronto em base64 e
// anexa no e-mail, sem montar layout algum. O app antigo usa jsPDF via CDN
// (webapp/index.html); como não é uma dependência npm do projeto, carregamos
// o mesmo script dinamicamente aqui (mesmo padrão já usado para carregar os
// modelos do face-api.js via CDN).
const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

let jsPdfPromise = null;
export function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSPDF_CDN_URL;
      script.async = true;
      script.onload = () => resolve(window.jspdf.jsPDF);
      script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
      document.head.appendChild(script);
    });
  }
  return jsPdfPromise;
}

export async function calcularHashSha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatarData(dStr) {
  const [ano, mes, dia] = dStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Porta o layout de webapp/app.js (gerarDocEspelhoPontoPDF), conforme a
// Portaria 671/2021 MTP.
export async function gerarEspelhoPontoPdf({ colaborador, registros }) {
  const JsPDFClass = await carregarJsPDF();
  const doc = new JsPDFClass();

  doc.setFillColor(37, 99, 235); // blue-600 — paleta da v2
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ESPELHO DE PONTO ELETRÔNICO', 15, 18);
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  doc.text('Portaria 671/2021 MTP — Identificação e Controle de Jornada', 15, 28);
  doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 150, 28);

  doc.setTextColor(51, 51, 51);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DADOS DO TRABALHADOR', 15, 52);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nome do Colaborador: ${colaborador.nome}`, 15, 60);
  doc.text(`Cargo / Função: ${(colaborador.role || '').toUpperCase()}`, 15, 66);
  doc.text(`CPF: ${colaborador.cpf || 'Não informado'}`, 15, 72);
  if (colaborador.dataAdmissao) {
    doc.text(`Data de Admissão: ${formatarData(colaborador.dataAdmissao.slice(0, 10))}`, 110, 72);
  }

  doc.setFillColor(240, 240, 240);
  doc.rect(15, 82, 180, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Data', 17, 87);
  doc.text('Entrada', 52, 87);
  doc.text('Almoço', 82, 87);
  doc.text('Retorno', 112, 87);
  doc.text('Saída', 142, 87);
  doc.text('Saldo', 172, 87);

  const grouped = {};
  registros.forEach((r) => {
    const dStr = r.timestamp.split('T')[0];
    if (!grouped[dStr]) grouped[dStr] = {};
    grouped[dStr][r.tipo] = r.timestamp;
  });
  const dates = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  doc.setFont('Helvetica', 'normal');
  let y = 96;
  dates.forEach((d) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const day = grouped[d];
    const ent = day.ENTRADA ? new Date(day.ENTRADA) : null;
    const sInt = day.SAIDA_INTERVALO ? new Date(day.SAIDA_INTERVALO) : null;
    const rInt = day.RETORNO_INTERVALO ? new Date(day.RETORNO_INTERVALO) : null;
    const sai = day.SAIDA ? new Date(day.SAIDA) : null;

    let workedMs = 0;
    if (ent && sInt) workedMs += sInt - ent;
    if (rInt && sai) workedMs += sai - rInt;
    const tHours = Math.floor(workedMs / 3600000);
    const tMins = Math.floor((workedMs % 3600000) / 60000);
    const saldoText = `${String(tHours).padStart(2, '0')}:${String(tMins).padStart(2, '0')}`;

    doc.text(formatarData(d), 17, y);
    doc.text(day.ENTRADA ? formatarHora(day.ENTRADA) : '-', 52, y);
    doc.text(day.SAIDA_INTERVALO ? formatarHora(day.SAIDA_INTERVALO) : '-', 82, y);
    doc.text(day.RETORNO_INTERVALO ? formatarHora(day.RETORNO_INTERVALO) : '-', 112, y);
    doc.text(day.SAIDA ? formatarHora(day.SAIDA) : '-', 142, y);
    doc.text(saldoText, 172, y);

    doc.setDrawColor(230, 230, 230);
    doc.line(15, y + 2, 195, y + 2);
    y += 8;
  });

  if (y > 240) {
    doc.addPage();
    y = 30;
  }
  y += 10;
  doc.setFont('Helvetica', 'bold');
  doc.text('ASSINATURA DO COLABORADOR E CERTIFICAÇÃO DIGITAL', 15, y);
  y += 8;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  const cryptoHash = await calcularHashSha256(registros.map((r) => r.hash || '').join(''));
  doc.text(`Hash de Integridade (Portaria 671): ${cryptoHash}`, 15, y);
  y += 20;
  doc.line(15, y, 100, y);
  doc.line(110, y, 195, y);
  y += 4;
  doc.text('Assinatura do Colaborador(a)', 40, y);
  doc.text('Assinatura Cacau Show / Gestor', 135, y);

  const nomeArquivo = `Espelho_Ponto_${colaborador.nome}_${new Date().getMonth() + 1}.pdf`;
  return { doc, nomeArquivo };
}
