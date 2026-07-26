const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfjsLib = require('pdfjs-dist');
const { db, normalizeRow } = require('../config/database');

const upload = multer({ storage: multer.memoryStorage() });

const MESES = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
};

// --------------------------------------------------------------------------
// Extração do texto do PDF, linha por linha, reconstruindo a posição real
// (agrupando itens por coordenada Y e ordenando por X) — assim uma coluna
// fora de ordem no PDF ainda aparece na linha certa, só que fora de ordem
// horizontal, o que os padrões abaixo (CPF/data/telefone) toleram bem,
// já que identificam o campo pelo formato, não pela posição.
async function extrairLinhasPDF(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const linhas = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const linhasMap = {};
    textContent.items.forEach(item => {
      const y = Math.round(item.transform[5] * 10) / 10;
      let chaveY = Object.keys(linhasMap).find(k => Math.abs(parseFloat(k) - y) < 4);
      if (!chaveY) { chaveY = y; linhasMap[chaveY] = []; }
      linhasMap[chaveY].push(item);
    });

    Object.keys(linhasMap)
      .sort((a, b) => parseFloat(b) - parseFloat(a))
      .forEach(y => {
        const itensLinha = linhasMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        linhas.push(itensLinha.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim());
      });
  }

  return linhas.filter(l => l.length > 0);
}

// Aceita "27/jul./2023", "09/jul/.2020", "27/07/2023", "27-07-2023" etc.
function extrairDataNascimento(linha) {
  const comMesAbreviado = linha.match(/(\d{1,2})\s*\/?\.?\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*\/?\.?\s*(\d{4})/i);
  if (comMesAbreviado) {
    const dia = comMesAbreviado[1].padStart(2, '0');
    const mes = MESES[comMesAbreviado[2].toLowerCase()];
    const ano = comMesAbreviado[3];
    return { match: comMesAbreviado[0], iso: `${ano}-${mes}-${dia}` };
  }
  const numerica = linha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (numerica) {
    const dia = numerica[1].padStart(2, '0');
    const mes = numerica[2].padStart(2, '0');
    const ano = numerica[3];
    return { match: numerica[0], iso: `${ano}-${mes}-${dia}` };
  }
  return null;
}

// O fallback "11 dígitos soltos" só vale se não bater com nenhum telefone já
// identificado na linha — senão, telefone sem formatação (ex. "91988887777")
// virava CPF por engano quando não havia CPF de verdade na linha.
function extrairCPF(linha, telefonesEncontrados) {
  const comPontuacao = linha.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (comPontuacao) return { match: comPontuacao[0], valor: comPontuacao[0] };

  const semPontuacao = [...linha.matchAll(/\b\d{11}\b/g)]
    .find(m => !telefonesEncontrados.includes(m[0]));
  return semPontuacao ? { match: semPontuacao[0], valor: semPontuacao[0] } : null;
}

function normalizarTelefone(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return digitos;
}

// Depois de remover CPF/data/telefone da linha, sobra o texto com os dois
// nomes (criança + responsável). Sem cabeçalho confiável pra saber a ordem
// das colunas, assume a ordem pedida (criança primeiro, responsável depois)
// e tenta separar por um espaçamento maior (2+ espaços, sinal de colunas no
// PDF original) antes de cair no fallback de dividir o texto ao meio.
function extrairNomes(textoRestante) {
  const limpo = textoRestante.replace(/\s{2,}/g, '  ').trim();
  const partesPorEspacoDuplo = limpo.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (partesPorEspacoDuplo.length === 2) {
    return { crianca: partesPorEspacoDuplo[0], responsavel: partesPorEspacoDuplo[1], confiavel: true };
  }

  const palavras = limpo.split(/\s+/).filter(Boolean);
  const meio = Math.ceil(palavras.length / 2);
  return {
    crianca: palavras.slice(0, meio).join(' '),
    responsavel: palavras.slice(meio).join(' '),
    confiavel: false
  };
}

function parsearLinhaAniversario(linha) {
  const data = extrairDataNascimento(linha);
  if (!data) return null; // sem data reconhecível, não é uma linha de registro

  const todosOsTelefones = [...linha.matchAll(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g)].map(m => m[0]);
  const telefone = todosOsTelefones.length > 0 ? { match: todosOsTelefones[0], valor: todosOsTelefones[0] } : null;
  if (!telefone) return null;
  const cpf = extrairCPF(linha, todosOsTelefones);

  let restante = linha.replace(data.match, ' ');
  if (cpf) restante = restante.replace(cpf.match, ' ');
  // Remove todos os telefones da linha (usamos só o primeiro no registro).
  restante = restante.replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, ' ');

  const { crianca, responsavel, confiavel } = extrairNomes(restante);
  if (!crianca || !responsavel) return null;

  return {
    nomeCrianca: crianca,
    dataNascimento: data.iso,
    documento: cpf ? cpf.valor : null,
    nomeResponsavel: responsavel,
    telefone: normalizarTelefone(telefone.valor),
    confiavel
  };
}

function upsertAniversario(registro) {
  return new Promise((resolve, reject) => {
    const id = `${registro.nomeCrianca}_${registro.nomeResponsavel}`;
    const agora = new Date().toISOString();
    db.run(
      `INSERT INTO aniversarios_registros
         (id, nomeCrianca, dataNascimento, documento, nomeResponsavel, telefone, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(nomeCrianca, nomeResponsavel) DO UPDATE SET
         dataNascimento = excluded.dataNascimento,
         documento = excluded.documento,
         telefone = excluded.telefone,
         atualizadoEm = excluded.atualizadoEm`,
      [id, registro.nomeCrianca, registro.dataNascimento, registro.documento, registro.nomeResponsavel, registro.telefone, agora, agora],
      (err) => err ? reject(err) : resolve()
    );
  });
}

router.post('/importar-pdf', upload.single('arquivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });
  }

  let linhas;
  try {
    linhas = await extrairLinhasPDF(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Falha ao ler o PDF: ${err.message}` });
  }

  const registros = [];
  const linhasNaoIdentificadas = [];
  linhas.forEach(linha => {
    const registro = parsearLinhaAniversario(linha);
    if (registro) registros.push(registro);
    else if (/\d{4}/.test(linha)) linhasNaoIdentificadas.push(linha); // só reporta linhas que pareciam ter dado
  });

  try {
    for (const registro of registros) {
      await upsertAniversario(registro);
    }
    res.json({
      success: true,
      linhasNoArquivo: linhas.length,
      importados: registros.length,
      duvidosos: registros.filter(r => !r.confiavel).length,
      linhasNaoIdentificadas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aniversariantes de hoje (dia e mês da dataNascimento == hoje), com a idade
// que completam e se já foram parabenizados neste ano (trava de reenvio).
router.get('/hoje', (req, res) => {
  const hoje = new Date();
  const diaHoje = String(hoje.getDate()).padStart(2, '0');
  const mesHoje = String(hoje.getMonth() + 1).padStart(2, '0');
  const anoAtual = hoje.getFullYear();

  db.all(`SELECT * FROM aniversarios_registros`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const doDia = (rows || [])
      .map(normalizeRow)
      .filter(r => {
        const data = String(r.dataNascimento || '').slice(0, 10);
        const [ano, mes, dia] = data.split('-');
        return dia === diaHoje && mes === mesHoje;
      })
      .map(r => {
        const anoNascimento = parseInt(String(r.dataNascimento).slice(0, 4), 10);
        return {
          ...r,
          idade: anoAtual - anoNascimento,
          jaEnviadoEsteAno: Number(r.mensagemEnviadaAno) === anoAtual
        };
      });

    res.json({ data: hoje.toISOString().slice(0, 10), registros: doDia });
  });
});

router.post('/marcar-enviado', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Campo "id" é obrigatório.' });

  const anoAtual = new Date().getFullYear();
  const agora = new Date().toISOString();
  db.run(
    `UPDATE aniversarios_registros SET mensagemEnviadaAno = ?, mensagemEnviadaEm = ? WHERE id = ?`,
    [anoAtual, agora, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
