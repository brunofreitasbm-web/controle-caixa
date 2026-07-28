export default function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
