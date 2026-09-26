"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <html lang="en"><body><main><div className="page"><h1 className="title">Gutter could not start.</h1><button className="lnk" onClick={reset}>Try again</button></div></main></body></html>; }
