export default function Table({ columns, children, className = '' }) {
  return (
    <div className={`overflow-x-auto -mx-4 md:mx-0 ${className}`}>
      <table className="w-full text-sm text-left border-collapse">
        {columns && (
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              {columns.map((col) => (
                <th key={col.key || col} className="px-4 py-3 font-bold whitespace-nowrap">
                  {col.label || col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr className={`hover:bg-slate-50 transition-colors ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-slate-700 whitespace-nowrap ${className}`}>{children}</td>;
}
