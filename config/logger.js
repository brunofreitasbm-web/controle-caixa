const { db } = require('./database');

function registrarLog(registroId, acao, descricao, usuario) {
  const data = new Date().toISOString();
  db.run(
    'INSERT INTO logs_auditoria (registroId, acao, descricao, usuario, data) VALUES (?, ?, ?, ?, ?)',
    [registroId, acao, descricao, usuario || 'Sistema', data],
    (err) => {
      if (err) console.error('Erro ao registrar log de auditoria:', err.message);
    }
  );
}

module.exports = { registrarLog };
