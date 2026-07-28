const VARIANTS = {
  primary:
    'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5',
  secondary:
    'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5',
  danger:
    'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 hover:-translate-y-0.5',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
  outline: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
};

const SIZES = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-6 py-3',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0 ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
