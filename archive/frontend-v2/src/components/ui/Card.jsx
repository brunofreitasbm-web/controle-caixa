const GRADIENTS = {
  blue: 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/10',
  emerald: 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/10',
  amber: 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/10',
  rose: 'bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/10',
};

export default function Card({ gradient, className = '', children, ...props }) {
  if (gradient) {
    return (
      <div
        className={`rounded-2xl p-4 md:p-6 text-white transition-all duration-300 hover:scale-[1.02] ${GRADIENTS[gradient] || GRADIENTS.blue} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
