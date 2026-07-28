import { useState } from 'react';
import { Lock, Settings } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Select from '../../components/ui/Select.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import { getCurrentUser, isOwner } from '../../lib/auth.js';
import { competenciaAtual } from './constants.js';
import RegrasConversaoForm from './components/RegrasConversaoForm.jsx';
import RegrasLocacoesForm from './components/RegrasLocacoesForm.jsx';

export default function RegrasPage() {
  const usuarioAtual = getCurrentUser();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [metodologia, setMetodologia] = useState('conversao');

  if (!isOwner(usuarioAtual)) {
    return (
      <Card className="animate-fade-in">
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Somente administradores (Owner) podem editar as regras de bonificação do FaçaAmigos."
        />
      </Card>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 text-emerald-600 p-2.5">
            <Settings size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Regras de Bonificação FaçaAmigos</h1>
            <p className="text-sm text-slate-500">Esta regra vale a partir da competência selecionada. Meses já fechados não são recalculados.</p>
          </div>
        </div>
        <Field label="Competência" className="w-44">
          <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </Field>
      </div>

      <Card>
        <p className="text-sm text-slate-500 mb-3">
          ParqueShopping (Playground) e Grão Pará usam <strong>bonificação por conversão</strong>. O Parque Circuito (Carrinhos) usa <strong>meta por locações</strong>.
        </p>
        <Field label="Editar regras de" className="max-w-sm">
          <Select value={metodologia} onChange={(e) => setMetodologia(e.target.value)}>
            <option value="conversao">Conversão — ParqueShopping &amp; Grão Pará</option>
            <option value="locacoes">Locações — Parque Circuito</option>
          </Select>
        </Field>
      </Card>

      {metodologia === 'conversao' ? (
        <RegrasConversaoForm competencia={competencia} />
      ) : (
        <RegrasLocacoesForm competencia={competencia} />
      )}
    </div>
  );
}
