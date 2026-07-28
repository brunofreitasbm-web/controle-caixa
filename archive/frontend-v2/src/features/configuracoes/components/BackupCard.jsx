import { DatabaseBackup } from 'lucide-react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import { useBackupManual } from '../../../hooks/useConfiguracoes.js';

export default function BackupCard() {
  const backup = useBackupManual();

  async function disparar() {
    try {
      const resultado = await backup.mutateAsync();
      if (resultado?.enviado) {
        toast.success(`Backup gerado e enviado por e-mail (referência ${resultado.referencia}).`);
      } else if (resultado?.motivo === 'ja_enviado_este_mes') {
        toast.info(`O backup deste mês já havia sido enviado (referência ${resultado.referencia}).`);
      } else if (resultado?.motivo === 'smtp_nao_configurado') {
        toast.error('Backup não enviado: e-mail (SMTP) não está configurado no servidor.');
      } else {
        toast.info('Backup processado.');
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao gerar o backup.');
    }
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Backup" subtitle="Cópia completa dos dados, enviada por e-mail" />
      <p className="text-sm text-slate-600 mb-4">
        O backup mensal roda automaticamente todos os dias às 6h (só é reenviado uma vez por mês). Use o botão
        abaixo para gerar e enviar uma cópia manual agora, fora do agendamento.
      </p>
      <Button onClick={disparar} disabled={backup.isPending}>
        <DatabaseBackup size={16} />
        {backup.isPending ? 'Gerando backup...' : 'Gerar backup agora'}
      </Button>
    </Card>
  );
}
