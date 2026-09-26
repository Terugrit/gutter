export function MetaTable({ rows }: { rows: [string, string][] }) { return <dl className="meta">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
