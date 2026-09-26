export function Headline({ lines }: { lines: string[] }) { return <h1 className="hl">{lines.map((line) => <span className="line" key={line}>{line}</span>)}</h1>; }
