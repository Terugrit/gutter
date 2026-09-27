/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { GeneratedCover } from "./generated-cover";
export function Cover({ src, seed, title, number, className = "cv" }: { src?: string; seed: number; title: string; number?: string | number; className?: string }) { const [failedSrc, setFailedSrc] = useState<string | null>(null); return src && src !== failedSrc ? <div className={className} role="img" aria-label={`${title} cover`}><img src={src} alt="" onError={() => setFailedSrc(src)} /></div> : <GeneratedCover className={className} seed={seed} title={title} number={number === undefined ? undefined : Number(number)} />; }
