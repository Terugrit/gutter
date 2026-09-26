"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IndexRow } from "@/components/index-row";
import { useListNavigation } from "@/components/use-list-navigation";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Notification } from "@/lib/services/notifications";
export function NotificationIndex({ notifications }: { notifications: Notification[] }) {
  const pathname = usePathname(); const [onlyUnread, setOnlyUnread] = useState(false); const [items, setItems] = useState(notifications);
  useEffect(() => setItems(notifications), [notifications]);
  useEffect(() => { const update = (event: Event) => { const detail = (event as CustomEvent<{ id: number; unread: boolean }>).detail; if (detail) setItems((current) => current.map((item) => item.id === detail.id ? { ...item, u: detail.unread ? 1 : 0 } : item)); }; window.addEventListener("gutter:notifications-changed", update); return () => window.removeEventListener("gutter:notifications-changed", update); }, []);
  const id = Number(pathname.split("/")[2]); const list = items.filter((item) => !onlyUnread || item.u || item.id === id);
  const router = useRouter();
  const open = useCallback((index: number) => { const item = list[index]; if (item) router.push(`/notifications/${item.id}`); }, [list, router]);
  const { containerRef, selectedIndex } = useListNavigation({ count: list.length, activeIndex: list.findIndex((item) => item.id === id), onOpen: open, openOnMove: id > 0, scope: id > 0 ? "desktop" : "all" });
  return <aside ref={containerRef} className="index" aria-label="Notifications"><div className="filters"><button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(!onlyUnread)}>Unread only</button></div><div className="idx-head"><span>No.</span><span>Notification</span><span /></div>{list.map((item, index) => <IndexRow item={item} selected={selectedIndex === index} navigationIndex={index} key={item.id} />)}</aside>;
}
