"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [["Dashboard", "/"], ["Library", "/library"], ["Shelf", "/shelf"], ["Notifications", "/notifications"], ["Discover", "/discover"], ["Settings", "/settings"]] as const;

export function TabBar({ attentionCount }: { attentionCount: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    const update = () => {
      void fetch("/api/notifications/unread", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : { count: 0 })
        .then((value: { count: number }) => setUnread(value.count > 0))
        .catch(() => undefined);
    };
    update();
    window.addEventListener("gutter:notifications-changed", update);
    const interval = window.setInterval(update, 30000);
    return () => { window.removeEventListener("gutter:notifications-changed", update); window.clearInterval(interval); };
  }, [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const bringIntoView = () => {
      if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.clientWidth) / 2;
    };
    bringIntoView();
    void document.fonts.ready.then(bringIntoView);
    const observer = new ResizeObserver(bringIntoView);
    observer.observe(nav);
    for (const link of nav.children) observer.observe(link);
    return () => observer.disconnect();
  }, [pathname]);

  return <nav ref={navRef} className="tabbar" aria-label="Main">{links.map(([label, href]) => <Link key={href} href={label === "Library" && attentionCount > 0 ? "/library?followed=1&attention=1" : href} aria-current={href === "/" ? pathname === "/" ? "page" : undefined : pathname.startsWith(href) ? "page" : undefined}>{label}{label === "Library" && attentionCount > 0 ? <span className="attention-badge" aria-label={`${attentionCount} ${attentionCount === 1 ? "series needs" : "series need"} a match`}>{attentionCount}</span> : null}{label === "Notifications" && unread ? <i className="ud" /> : null}</Link>)}</nav>;
}
