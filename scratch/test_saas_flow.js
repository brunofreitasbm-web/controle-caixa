const app = require('../server');

async function testSaasFlow() {
  const PORT = 5005;
  const server = app.listen(PORT, async () => {
    console.log(`=== SERVER TESTE RODANDO NA PORTA ${PORT} ===`);
    
    // 1. Teste de Trial Signup (/api/saas/trial-signup)
    const trialPayload = {
      nome: "Carlos Franqueado Teste",
      email: `carlos.${Date.now()}@franquia.com`,
      telefone: "91999998888",
      lojas: 2,
      nomeLoja: "Cacau Show Shopping Teste"
    };

    console.log("\n[1/4] Testando /api/saas/trial-signup...");
    try {
      const res = await fetch(`http://localhost:${PORT}/api/saas/trial-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trialPayload)
      });
      const data = await res.json();
      console.log("STATUS:", res.status);
      console.log("RESPOSTA TRIAL SIGNUP:", data);

      if (data.ok && data.pinSimulado) {
        console.log("✅ OK! OrgID:", data.orgId, "PIN:", data.pinSimulado);

        // 2. Testar Login com Email + PIN (/api/login-email-pin)
        console.log("\n[2/4] Testando /api/login-email-pin...");
        const loginRes = await fetch(`http://localhost:${PORT}/api/login-email-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trialPayload.email, pin: data.pinSimulado })
        });
        const loginData = await loginRes.json();
        console.log("STATUS:", loginRes.status);
        console.log("RESPOSTA LOGIN:", loginData);

        if (loginData.success && loginData.token) {
          console.log("✅ OK! Token de sessão:", loginData.token);

          // 3. Testar cadastro de Colaborador / Funcionário (/api/colaboradores)
          console.log("\n[3/4] Testando POST /api/colaboradores com Token...");
          const colabRes = await fetch(`http://localhost:${PORT}/api/colaboradores`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
              nome: "Joana Atendente Teste",
              role: "operador",
              email: "joana@franquia.com",
              telefone: "91988887777"
            })
          });
          const colabData = await colabRes.json();
          console.log("STATUS:", colabRes.status);
          console.log("RESPOSTA CADASTRO COLABORADOR:", colabData);

          // 4. Testar cadastro de Unidade/Loja (/api/tenant/unidades)
          console.log("\n[4/4] Testando POST /api/tenant/unidades com Token...");
          const unidadeRes = await fetch(`http://localhost:${PORT}/api/tenant/unidades`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
              negocioChave: "cacau-show",
              nome: `Loja Shopping ${Date.now()}`,
              codigoExterno: "9999"
            })
          });
          const unidadeData = await unidadeRes.json();
          console.log("STATUS:", unidadeRes.status);
          console.log("RESPOSTA CADASTRO UNIDADE:", unidadeData);
        } else {
          console.log("❌ Falha no login com Email + PIN");
        }
      } else {
        console.log("❌ Falha no trial signup");
      }
    } catch (err) {
      console.error("❌ Erro durante o teste:", err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

testSaasFlow();
