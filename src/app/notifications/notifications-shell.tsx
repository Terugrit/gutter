"use client";
import { usePathname } from "next/navigation";
export function NotificationsShell({ index, children }: { index: React.ReactNode; children: React.ReactNode }) { const pathname = usePathname(); return <div className={`split${/^\/notifications\/\d+$/.test(pathname) ? " has-sel" : ""}`}>{index}{children}</div>; }
