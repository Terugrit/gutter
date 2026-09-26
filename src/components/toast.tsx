"use client";
import { createContext, useContext, useState } from "react";
const ToastContext = createContext<(message: string) => void>(() => undefined);
export function ToastProvider({ children }: { children: React.ReactNode }) { const [message, setMessage] = useState(""); const show = (value: string) => { setMessage(value); window.setTimeout(() => setMessage(""), 2200); }; return <ToastContext.Provider value={show}>{children}<div className={`toast${message ? " on" : ""}`} role="status" aria-live="polite">{message}</div></ToastContext.Provider>; }
export const useToast = () => useContext(ToastContext);
