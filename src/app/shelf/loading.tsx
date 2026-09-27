export default function Loading() {
  return <div className="page" role="status" aria-label="Loading reading shelf"><div className="skeleton-title" /><div className="idx-head"><span>No.</span><span>Saved series</span><span>Year</span></div>{[1, 2, 3].map((number) => <div className="row" key={number}><span className="num">{String(number).padStart(2, "0")}</span><span className="skeleton-bar" /><span /></div>)}</div>;
}
