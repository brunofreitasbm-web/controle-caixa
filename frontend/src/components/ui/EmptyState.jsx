import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Nada por aqui', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="rounded-full bg-slate-100 text-slate-400 p-4 mb-4">
        <Icon size={28} />
      </div>
      <p className="text-slate-700 font-bold">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
