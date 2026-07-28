import Card from './Card.jsx';

export default function PagePlaceholder({ title }) {
  return (
    <Card className="animate-fade-in">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-500 mt-2">Este módulo está em construção na v2.0.</p>
    </Card>
  );
}
