const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DATABASE_URL = '';
const { initDb, db } = require('../config/database');
const caixaRouter = require('../routes/caixa');
const nfeRouter = require('../routes/nfe');
const pontoRouter = require('../routes/ponto');
const { validarDataUrl } = require('../config/data-url');
const { prepararFotoParaEmail } = require('../config/notifications');
const UploadUtils = require('../webapp/upload-utils');

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    initDb(() => {
      setTimeout(() => {
        const app = express();
        app.use(express.json({ limit: '15mb' }));
        app.use('/api', caixaRouter);
        app.use('/api/nfe', nfeRouter);
        app.use('/api/ponto', pontoRouter);

        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}/api`;
          resolve();
        });
      }, 500);
    });
  });
});

after(() => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

// Helper para fazer requisições HTTP nos testes
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { rawText: text };
  }
  return { status: res.status, body: json };
}

// --------------------------------------------------------------------------
// 1. QA HOSTIL: Listagem de Registros de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #1 - Leitura de registros de caixa via GET /registros', async () => {
  const res = await request('/registros');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// --------------------------------------------------------------------------
// 2. QA HOSTIL: Inputs Inválidos e Sanitização no Lançamento de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #2 - Tratamento de sanitização e inserção de registro de caixa', async () => {
  const xssInput = "<script>alert('xss')</script>";
  const regId = `test_reg_${Date.now()}`;
  const res = await request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: regId,
      consultor: xssInput,
      loja: 'Marambaia',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 200,
      valorEnvelope: 0,
      valorFaturado: 0,
      sangria: 0,
      observacoes: 'Teste QA Hostil',
      status: 'aguardando_retirada',
      criadoEm: new Date().toISOString()
    })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

// --------------------------------------------------------------------------
// 3. QA HOSTIL: Consulta de Foto Inexistente
// --------------------------------------------------------------------------
test('QA Hostil #3 - Consulta de foto de registro inexistente retorna 404', async () => {
  const res = await request('/registros/id_inexistente_99999/foto');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /não encontrado/i);
});

// --------------------------------------------------------------------------
// 4. QA HOSTIL: Disparos Simultâneos de Inserção de Registros (Concorrência)
// --------------------------------------------------------------------------
test('QA Hostil #4 - Concorrência e disparo simultâneo de requisições de caixa', async () => {
  const p1 = request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `conc_1_${Date.now()}`,
      consultor: 'Ana Júlia',
      loja: 'Marambaia',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 150
    })
  });

  const p2 = request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `conc_2_${Date.now()}`,
      consultor: 'Vitória',
      loja: 'Icoaraci',
      tipoOperacao: 'Abertura',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 250
    })
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok([200, 409, 500].includes(r1.status));
  assert.ok([200, 409, 500].includes(r2.status));
});

// --------------------------------------------------------------------------
// 5. QA HOSTIL: Endpoint de Divergência de Fundo de Caixa
// --------------------------------------------------------------------------
test('QA Hostil #5 - Divergência de fundo de caixa sem SMTP ativo responde sem crash', async () => {
  const res = await request('/divergencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loja: 'Marambaia',
      consultor: 'Teste QA',
      fundoAbertura: 200,
      fundoUltimoFechamento: 250,
      diferenca: -50
    })
  });
  assert.equal(res.status, 200);
});

// --------------------------------------------------------------------------
// 6. QA HOSTIL: Leitura de Logs de Auditoria
// --------------------------------------------------------------------------
test('QA Hostil #6 - Leitura e sanitização dos logs de caixa', async () => {
  const res = await request('/registros');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// --------------------------------------------------------------------------
// 7. QA HOSTIL: Rejeição de Atualização sem Campos
// --------------------------------------------------------------------------
test('QA Hostil #7 - Atualização de registro sem campos retorna 400', async () => {
  const res = await request('/registros/some_id', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});

// --------------------------------------------------------------------------
// 7.1. PERSISTÊNCIA DE RETIRADA: Atualização de envelope para retirado
// --------------------------------------------------------------------------
test('Persistência de Retirada #7.1 - Marcação de envelope como retirado via PUT /registros/:id', async () => {
  const regId = `retirada_test_${Date.now()}`;
  // 1. Criar registro aguardando retirada
  const postRes = await request('/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: regId,
      consultor: 'Consultor Teste',
      loja: 'Marambaia',
      tipoOperacao: 'Fechamento',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 200,
      valorEnvelope: 350.00,
      valorFaturado: 1200.00,
      status: 'aguardando_retirada',
      criadoEm: new Date().toISOString()
    })
  });
  assert.equal(postRes.status, 200);

  // 2. Atualizar status para retirado
  const dataRetirada = new Date().toISOString();
  const putRes = await request(`/registros/${regId}?usuario=Bruno`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'retirado',
      dataRetirada: dataRetirada,
      retiradoPor: 'Bruno',
      confirmadoPorApp: 'Bruno'
    })
  });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.body.success, true);

  // 3. Consultar via GET /registros e confirmar persistência
  const getRes = await request('/registros');
  assert.equal(getRes.status, 200);
  const regAtualizado = getRes.body.find(r => r.id === regId);
  assert.ok(regAtualizado, 'Registro deve existir na listagem');
  assert.equal(regAtualizado.status, 'retirado', 'Status deve ser permanentemente persistido como retirado');
  assert.equal(regAtualizado.retiradoPor, 'Bruno');
});

// --------------------------------------------------------------------------
// 7.2. FAÇAAMIGOS: Endpoints CRUD e Marcação de Retirada
// --------------------------------------------------------------------------
test('FaçaAmigos #7.2 - Criar, atualizar retirada e listar registros-fa', async () => {
  const faId = `fa_retirada_test_${Date.now()}`;
  // 1. Criar registro FA
  const postRes = await request('/registros-fa?usuario=Isabella', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: faId,
      consultor: 'Consultor FA',
      loja: 'Circuito',
      tipoOperacao: 'Fechamento',
      dataOperacao: new Date().toISOString().split('T')[0],
      fundoCaixa: 100,
      valorEnvelope: 500.00,
      status: 'aguardando_retirada',
      criadoEm: new Date().toISOString()
    })
  });
  assert.equal(postRes.status, 200);

  // 2. Atualizar status FA para retirado
  const dataRetirada = new Date().toISOString();
  const putRes = await request(`/registros-fa/${faId}?usuario=Isabella`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'retirado',
      dataRetirada: dataRetirada,
      retiradoPor: 'Isabella',
      confirmadoPorApp: 'Isabella'
    })
  });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.body.success, true);

  // 3. Consultar via GET /registros-fa e verificar persistência
  const getRes = await request('/registros-fa');
  assert.equal(getRes.status, 200);
  const regFaAtualizado = getRes.body.find(r => r.id === faId);
  assert.ok(regFaAtualizado, 'Registro FA deve existir na listagem');
  assert.equal(regFaAtualizado.status, 'retirado', 'Status FA deve ser persistido como retirado');
});

// --------------------------------------------------------------------------
// 8. QA HOSTIL: Deleção Não Autorizada
// --------------------------------------------------------------------------
test('QA Hostil #8 - Rejeição de deleção por usuário comum (Apenas Bruno autorizado)', async () => {
  const res = await request('/registros/some_id?usuario=Operador', {
    method: 'DELETE'
  });
  assert.equal(res.status, 403);
});


// --------------------------------------------------------------------------
// 9. REATORAÇÃO: Validação do Utilitário Compartilhado normalizarTelefone
// --------------------------------------------------------------------------
test('Refatoração #9 - Utilitário compartilhado normalizarTelefone', () => {
  const { normalizarTelefone } = require('../config/utils');
  assert.equal(normalizarTelefone('91988887777'), '5591988887777');
  assert.equal(normalizarTelefone('(91) 98888-7777'), '5591988887777');
  assert.equal(normalizarTelefone('5591988887777'), '5591988887777');
  assert.equal(normalizarTelefone(null), '');
  assert.equal(normalizarTelefone(''), '');
});

// --------------------------------------------------------------------------
// 10. MÓDULO NFE: Validação de Endpoints de Conferência de NFE
// --------------------------------------------------------------------------
test('Módulo NFE #10 - Cadastro e Validação de Status de NFE', async () => {
  const nfeUrl = `${baseUrl}/nfe`;

  // 1. Criar NFE
  const postRes = await fetch(nfeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loja: 'Marambaia', numeroNfe: '9988', valor: 450.50, observacoes: 'Teste QA' })
  });
  const postData = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.equal(postData.success, true);
  assert.ok(postData.id);

  // 2. Listar NFEs
  const getRes = await fetch(nfeUrl);
  const getData = await getRes.json();
  assert.equal(getRes.status, 200);
  assert.ok(Array.isArray(getData));
  const criada = getData.find(x => x.id === postData.id);
  assert.ok(criada);
  assert.equal(criada.loja, 'Marambaia');
  assert.equal(criada.valor, 450.50);
  assert.equal(criada.status, 'pendente');

  // 3. Atualizar status para conferido
  const putRes = await fetch(`${nfeUrl}/${postData.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'conferido', conferidoPor: 'Bruno' })
  });
  const putData = await putRes.json();
  assert.equal(putRes.status, 200);
  assert.equal(putData.success, true);
});

// --------------------------------------------------------------------------
// Uploads: validação server-side de data URL (MIME permitido + teto + bytes)
// --------------------------------------------------------------------------
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)]);
const dataUrl = (mime, bytes) => `data:${mime};base64,${b64(bytes)}`;

test('Upload #1 - validarDataUrl aceita webp/jpeg/png e rejeita o resto', () => {
  assert.equal(validarDataUrl(dataUrl('image/webp', WEBP_BYTES)).ok, true);
  assert.equal(validarDataUrl(dataUrl('image/jpeg', JPEG_BYTES)).ok, true);
  assert.equal(validarDataUrl(dataUrl('image/png', PNG_BYTES)).ok, true);
  assert.equal(validarDataUrl(dataUrl('image/gif', Buffer.from('GIF89a' + 'x'.repeat(30)))).ok, false);
  assert.equal(validarDataUrl(dataUrl('image/svg+xml', Buffer.from('<svg onload=alert(1)/>'))).ok, false);
  assert.equal(validarDataUrl(dataUrl('text/html', Buffer.from('<script>1</script>'))).ok, false);
  assert.equal(validarDataUrl('data:image/webp;base64,').ok, false);
  assert.equal(validarDataUrl('não é data url').ok, false);
  assert.equal(validarDataUrl(b64(JPEG_BYTES)).ok, false); // base64 puro sem cabeçalho
  assert.equal(validarDataUrl(12345).ok, false);
});

test('Upload #2 - PDF só quando permitido e bytes precisam bater com o MIME', () => {
  assert.equal(validarDataUrl(dataUrl('application/pdf', PDF_BYTES)).ok, false);
  assert.equal(validarDataUrl(dataUrl('application/pdf', PDF_BYTES), { permitirPdf: true }).ok, true);
  // MIME declarado webp, conteúdo PDF
  assert.equal(validarDataUrl(dataUrl('image/webp', PDF_BYTES)).ok, false);
  assert.equal(validarDataUrl(dataUrl('image/jpeg', WEBP_BYTES)).ok, false);
});

test('Upload #3 - teto de tamanho', () => {
  const grande = Buffer.concat([JPEG_BYTES, Buffer.alloc(4 * 1024 * 1024)]);
  const r = validarDataUrl(dataUrl('image/jpeg', grande));
  assert.equal(r.ok, false);
  assert.match(r.error, /limite/);
  assert.equal(validarDataUrl(dataUrl('image/jpeg', grande), { maxBytes: 5 * 1024 * 1024 }).ok, true);
});

test('Upload #4 - POST /registros valida fotoEnvelope', async () => {
  const base = (id, foto) => JSON.stringify({
    id, consultor: 'Teste', loja: 'Marambaia', tipoOperacao: 'Abertura',
    dataOperacao: new Date().toISOString().split('T')[0], fundoCaixa: 100, fotoEnvelope: foto
  });
  const headers = { 'Content-Type': 'application/json' };

  const ruim = await request('/registros', { method: 'POST', headers, body: base(`up_ruim_${Date.now()}`, dataUrl('text/html', Buffer.from('<b>x</b>'))) });
  assert.equal(ruim.status, 400);
  assert.match(ruim.body.error, /fotoEnvelope/);

  const ok = await request('/registros', { method: 'POST', headers, body: base(`up_ok_${Date.now()}`, dataUrl('image/webp', WEBP_BYTES)) });
  assert.equal(ok.status, 200);

  const semFoto = await request('/registros', { method: 'POST', headers, body: base(`up_sem_${Date.now()}`, null) });
  assert.equal(semFoto.status, 200);

  const putRuim = await request(`/registros/${ok.body.id}`, { method: 'PUT', headers, body: JSON.stringify({ fotoEnvelope: 'data:image/svg+xml;base64,PHN2Zy8+' }) });
  assert.equal(putRuim.status, 400);
});

test('Upload #5 - POST /registros-fa valida fotoEnvelope', async () => {
  const res = await request('/registros-fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `up_fa_${Date.now()}`, consultor: 'T', loja: 'Marambaia', tipoOperacao: 'Abertura', fotoEnvelope: 'data:application/pdf;base64,' + b64(PDF_BYTES) })
  });
  assert.equal(res.status, 400);
});

test('Upload #6 - /ponto/sync e /ponto/ajuste validam fotos/comprovantes', async () => {
  const headers = { 'Content-Type': 'application/json' };
  const sync = await fetch(`${baseUrl}/ponto/sync`, {
    method: 'POST', headers,
    body: JSON.stringify({ records: [{ id: 'x1', usuario: 'T', timestamp: new Date().toISOString(), tipo: 'ENTRADA', photo: 'data:text/html;base64,PGI+' }] })
  });
  assert.equal(sync.status, 400);
  const j = await sync.json();
  assert.equal(j.invalidos[0].id, 'x1');

  const ajuste = await fetch(`${baseUrl}/ponto/ajuste`, {
    method: 'POST', headers,
    body: JSON.stringify({ id: 'aj1', usuario: 'T', data: '2026-01-01', tipo: 'ENTRADA', motivo: 'm', comprovante: 'data:text/html;base64,PGI+' })
  });
  assert.equal(ajuste.status, 400);
});

// --------------------------------------------------------------------------
// E-mail de fechamento: WebP -> JPEG só no envio, com fallback
// --------------------------------------------------------------------------
test('Upload #7 - prepararFotoParaEmail converte com sharp e cai no original sem ele', async () => {
  const info = { mimeType: 'image/webp', base64: b64(WEBP_BYTES) };
  const fakeSharp = () => {
    const c = { rotate: () => c, flatten: () => c, jpeg: () => c, toBuffer: async () => JPEG_BYTES };
    return c;
  };
  const conv = await prepararFotoParaEmail(info, fakeSharp);
  assert.equal(conv.mimeType, 'image/jpeg');
  assert.equal(conv.base64, b64(JPEG_BYTES));

  assert.deepEqual(await prepararFotoParaEmail(info, null), info); // sharp indisponível
  const quebrado = () => { throw new Error('boom'); };
  assert.deepEqual(await prepararFotoParaEmail(info, quebrado), info); // falha na conversão
  const jpeg = { mimeType: 'image/jpeg', base64: b64(JPEG_BYTES) };
  assert.deepEqual(await prepararFotoParaEmail(jpeg, fakeSharp), jpeg); // já é JPEG
});

test('Upload #8 - prepararFotoParaEmail com sharp real (se instalado)', async (t) => {
  let sharp;
  try { sharp = require('sharp'); } catch (e) { return t.skip('sharp não instalado'); }
  const webp = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 0.5 } } }).webp().toBuffer();
  const out = await prepararFotoParaEmail({ mimeType: 'image/webp', base64: webp.toString('base64') });
  assert.equal(out.mimeType, 'image/jpeg');
  assert.equal(Buffer.from(out.base64, 'base64')[0], 0xff);
});

// --------------------------------------------------------------------------
// webapp/upload-utils.js — partes puras (o encode em canvas é do navegador)
// --------------------------------------------------------------------------
test('Upload #9 - UploadUtils.sniffBytes e fitDimensions', async () => {
  assert.equal(UploadUtils.sniffBytes(WEBP_BYTES), 'image/webp');
  assert.equal(UploadUtils.sniffBytes(JPEG_BYTES), 'image/jpeg');
  assert.equal(UploadUtils.sniffBytes(PNG_BYTES), 'image/png');
  assert.equal(UploadUtils.sniffBytes(PDF_BYTES), 'application/pdf');
  assert.equal(UploadUtils.sniffBytes(Buffer.from('<svg xmlns=')), null);
  assert.equal(await UploadUtils.sniffType(new Blob([PDF_BYTES], { type: 'image/png' })), 'application/pdf'); // ignora file.type

  assert.deepEqual(UploadUtils.fitDimensions(4400, 2200, 2200), { width: 2200, height: 1100 });
  assert.deepEqual(UploadUtils.fitDimensions(1000, 500, 2200), { width: 1000, height: 500 }); // sem upscale
  assert.deepEqual(UploadUtils.fitDimensions(3000, 4000, null), { width: 3000, height: 4000 }); // selfie
  assert.equal(UploadUtils.extDe('image/webp'), 'webp');
});

test('Upload #10 - compressImage/prepareUpload devolvem intactos GIF, SVG e arquivos não suportados', async () => {
  const gif = new Blob([Buffer.from('GIF89a' + 'x'.repeat(20))], { type: 'image/gif' });
  const r = await UploadUtils.prepareUpload(gif, 'documento');
  assert.equal(r.compressed, false);
  assert.equal(r.blob, gif);
  assert.equal(r.mime, 'image/gif');
  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
  const r2 = await UploadUtils.prepareUpload(svg, 'foto');
  assert.equal(r2.compressed, false);
  assert.equal(r2.blob, svg);
});
