"use client";
import { useEffect, useRef, useState } from "react";

type Options = { count: number; onOpen: (index: number) => void; activeIndex?: number; onEscape?: () => void; enabled?: boolean; openOnMove?: boolean; scope?: "all" | "mobile" | "desktop" };
export function useListNavigation({ count, onOpen, activeIndex = -1, onEscape, enabled = true, openOnMove = false, scope = "all" }: Options) {
  const containerRef = useRef<HTMLElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(activeIndex);
  useEffect(() => { setSelectedIndex(activeIndex); }, [activeIndex]);
  useEffect(() => {
    if (!enabled) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      if (scope === "mobile" && !mobile || scope === "desktop" && mobile) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
      if (event.key === "Escape" && onEscape && mobile) { event.preventDefault(); onEscape(); return; }
      if ((event.key === "j" || event.key === "ArrowDown") && count > 0) { event.preventDefault(); const next = Math.min(selectedIndex + 1, count - 1); setSelectedIndex(next); if (openOnMove) onOpen(next); }
      if ((event.key === "k" || event.key === "ArrowUp") && count > 0) { event.preventDefault(); const next = selectedIndex < 0 ? 0 : Math.max(selectedIndex - 1, 0); setSelectedIndex(next); if (openOnMove) onOpen(next); }
      if (event.key === "Enter" && selectedIndex >= 0 && selectedIndex < count && !target.closest("a,button,[role='button']")) { event.preventDefault(); onOpen(selectedIndex); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [count, enabled, onEscape, onOpen, openOnMove, scope, selectedIndex]);
  useEffect(() => { if (selectedIndex >= 0) containerRef.current?.querySelector<HTMLElement>(`[data-list-nav="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);
  return { containerRef: (node: HTMLElement | null) => { containerRef.current = node; }, selectedIndex };
}
