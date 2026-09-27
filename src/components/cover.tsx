/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { GeneratedCover } from "./generated-cover";
export function Cover({ src, seed, title, number, className = "cv", detailRef }: { src?: string; seed: number; title: string; number?: string | number; className?: string; detailRef?: string }) { const [failedSrc, setFailedSrc] = useState<string | null>(null); const detailProps = detailRef ? { "data-series-detail": detailRef, tabIndex: 0, "aria-haspopup": "dialog" as const } : {}; return src && src !== failedSrc ? <div className={className} role={detailRef ? "button" : "img"} aria-label={`${title} cover`} {...detailProps}><img src={src} alt="" onError={() => setFailedSrc(src)} /></div> : <GeneratedCover className={className} seed={seed} title={title} number={number === undefined ? undefined : Number(number)} detailRef={detailRef} />; }
