/* eslint-disable @next/next/no-img-element */
import { GeneratedCover } from "./generated-cover";
export function Cover({ src, seed, title, number, className = "cv" }: { src?: string; seed: number; title: string; number?: string | number; className?: string }) { return src ? <div className={className} role="img" aria-label={`${title} cover`}><img src={src} alt="" /></div> : <GeneratedCover className={className} seed={seed} title={title} number={number === undefined ? undefined : Number(number)} />; }
