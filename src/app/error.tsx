"use client";
import { useEffect } from "react";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => undefined, []); return <div className="page"><h1 className="title">This page could not load.</h1><button className="lnk" onClick={reset}>Try again</button></div>; }
