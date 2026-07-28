const GRADIENTS = {
  blue: 'from-blue-600 to-indigo-700 shadow-blue-500/10',
  emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/10',
  amber: 'from-amber-500 to-orange-600 shadow-amber-500/10',
  rose: 'from-rose-500 to-red-600 shadow-rose-500/10',
};

export default function StatCard({ label, value, icon: Icon, gradient = 'blue', hint, className = '' }) {
  return (
    <div
      className={`rounded-2xl p-4 md:p-6 text-white bg-gradient-to-br shadow-lg transition-all duration-300 hover:scale-[1.02] ${GRADIENTS[gradient] || GRADIENTS.blue} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {hint && <p className="text-xs text-white/70 mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className="rounded-full bg-white/15 p-2.5">
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
