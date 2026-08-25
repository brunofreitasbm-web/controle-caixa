import json, re

unbundled_file = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\scratch\unbundled_landing.html"
original_file = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\Hub de Operações - Landing.html"

with open(unbundled_file, "r", encoding="utf-8") as f:
    content = f.read()

# Replace HTML section #trial
old_trial_html = """  <!-- CTA FINAL -->
  <section id="trial" style="background: var(--color-accent); color: var(--color-bg);">
    <div style="max-width: 1200px; margin: 0 auto; padding: 72px clamp(20px,5vw,72px);">
      <h2 style="font-size: clamp(30px,4vw,52px); margin: 0 0 16px; color: var(--color-bg);">Sua próxima entrega já pode chegar sem prejuízo.</h2>
      <p style="font-size: 17px; max-width: 56ch; margin: 0 0 32px; opacity: 0.9;">Comece agora com 7 dias grátis. Sem cartão, sem contrato de fidelidade.</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; max-width: 520px;">
        <input class="input" type="email" placeholder="seu@email.com" value="{{ emailInput }}" sc-camel-on-change="{{ setEmailInput }}" style="flex: 1; min-width: 220px; background: var(--color-bg);">
        <button type="button" class="btn btn-ghost" style="color: var(--color-bg); border-color: var(--color-bg);" sc-camel-on-click="{{ submitTrial }}">Começar teste grátis</button>
      </div>
      <sc-if value="{{ trialSubmitted }}">
        <p style="margin: 16px 0 0; font-size: 14px;">Recebemos seu e-mail. Confira sua caixa de entrada para ativar o acesso.</p>
      </sc-if>
    </div>
  </section>"""

new_trial_html = """  <!-- CTA FINAL -->
  <section id="trial" style="background: var(--color-accent); color: var(--color-bg);">
    <div style="max-width: 1200px; margin: 0 auto; padding: 72px clamp(20px,5vw,72px);">
      <h2 style="font-size: clamp(30px,4vw,52px); margin: 0 0 16px; color: var(--color-bg);">Sua próxima entrega já pode chegar sem prejuízo.</h2>
      <p style="font-size: 17px; max-width: 56ch; margin: 0 0 32px; opacity: 0.9;">Comece agora com 7 dias grátis. Sem cartão, sem contrato de fidelidade.</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; max-width: 520px;">
        <input class="input" type="email" placeholder="seu@email.com" value="{{ emailInput }}" sc-camel-on-change="{{ setEmailInput }}" style="flex: 1; min-width: 220px; background: var(--color-bg);">
        <button type="button" class="btn btn-ghost" style="color: var(--color-bg); border-color: var(--color-bg);" sc-camel-on-click="{{ submitTrial }}" disabled="{{ trialLoading }}">Começar teste grátis</button>
      </div>
      <sc-if value="{{ trialSubmitted }}">
        <div style="margin: 24px 0 0; padding: 20px; background: rgba(255,255,255,0.18); border: 2px solid rgba(255,255,255,0.4); border-radius: 14px; font-size: 15px; line-height: 1.6; color: var(--color-bg);">
          <strong style="font-size: 18px; display: block; margin-bottom: 6px;">🎉 Tudo certo! Seu teste grátis de 7 dias começou.</strong>
          <p style="margin: 0 0 12px;">{{ trialSuccessMsg }}</p>
          <sc-if value="{{ trialPin }}">
            <p style="margin: 0 0 10px; font-size: 14px; background: rgba(0,0,0,0.25); padding: 8px 14px; border-radius: 8px; display: inline-block;">
              <strong>Seu PIN de Acesso Temporário:</strong> <span style="font-size: 18px; letter-spacing: 2px; font-weight: bold;">{{ trialPin }}</span>
            </p>
          </sc-if>
          <br>
          <small style="opacity: 0.95;">📧 Um e-mail com todas as credenciais e o link de entrada no sistema acabou de ser enviado para <strong>{{ emailInput }}</strong>. Verifique também sua caixa de Spam/Lixo eletrônico.</small>
        </div>
      </sc-if>
      <sc-if value="{{ trialError }}">
        <p style="margin: 16px 0 0; font-size: 14px; color: #ffe6e6; background: rgba(180, 0, 0, 0.4); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,200,200,0.4);">
          ⚠️ {{ trialError }}
        </p>
      </sc-if>
    </div>
  </section>"""

content = content.replace(old_trial_html, new_trial_html)

# Replace submitTrial method and state in JS
old_state = """  state = {
    scannedItems: [],
    metaTotal: 1250,
    hourValue: 450,
    hourlyTarget: 500,
    saleInput: '',
    emailInput: '',
    trialSubmitted: false,
    discActive: 'D',
    faqOpen: 0,
  };"""

new_state = """  state = {
    scannedItems: [],
    metaTotal: 1250,
    hourValue: 450,
    hourlyTarget: 500,
    saleInput: '',
    emailInput: '',
    trialSubmitted: false,
    trialLoading: false,
    trialError: '',
    trialSuccessMsg: '',
    trialPin: '',
    discActive: 'D',
    faqOpen: 0,
  };"""

content = content.replace(old_state, new_state)

old_submit_trial = "  setEmailInput = (e) => this.setState({ emailInput: e.target.value });\n  submitTrial = () => { if (this.state.emailInput) this.setState({ trialSubmitted: true }); };"

new_submit_trial = """  setEmailInput = (e) => this.setState({ emailInput: e.target.value });
  submitTrial = async () => {
    const email = (this.state.emailInput || '').trim();
    if (!email) return;

    this.setState({ trialLoading: true, trialError: '', trialSubmitted: false });

    try {
      const res = await fetch('/api/saas/trial-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, nome: 'Franqueado' })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        this.setState({
          trialSubmitted: true,
          trialLoading: false,
          trialPin: data.pinSimulado || '',
          trialSuccessMsg: data.mensagem || 'Confira seu e-mail para o acesso ao Hub de Operações e os próximos passos para importar a primeira nota fiscal e ativar a conferência por bipagem.'
        });
      } else {
        this.setState({
          trialLoading: false,
          trialError: data.error || 'Erro ao cadastrar. Tente novamente.'
        });
      }
    } catch (err) {
      console.error('[Trial Signup Error]', err);
      this.setState({
        trialLoading: false,
        trialError: 'Falha na comunicação com o servidor. Verifique se o servidor está rodando.'
      });
    }
  };"""

content = content.replace(old_submit_trial, new_submit_trial)

# Replace renderVals return object
old_render_vals = """      setEmailInput: this.setEmailInput,
      submitTrial: this.submitTrial,
      trialSubmitted: s.trialSubmitted,
      scrollToTrial: this.scrollToTrial,"""

new_render_vals = """      setEmailInput: this.setEmailInput,
      submitTrial: this.submitTrial,
      trialSubmitted: s.trialSubmitted,
      trialLoading: s.trialLoading,
      trialError: s.trialError,
      trialSuccessMsg: s.trialSuccessMsg,
      trialPin: s.trialPin,
      scrollToTrial: this.scrollToTrial,"""

content = content.replace(old_render_vals, new_render_vals)

with open(unbundled_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated unbundled_landing.html successfully.")
