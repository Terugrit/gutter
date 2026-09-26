export default function Loading() {
  return <div className="page" role="status" aria-label="Loading"><div className="skeleton-title" /><div className="idx-head"><span>No.</span><span>Loading</span><span /></div>{Array.from({ length: 6 }, (_, index) => <div className="row" key={index}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="skeleton-bar" /><span /></div>)}</div>;
}
