"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IndexRow } from "@/components/index-row";
import { useListNavigation } from "@/components/use-list-navigation";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import type { Notification } from "@/lib/services/notifications";
export function NotificationIndex({ notifications }: { notifications: Notification[] }) {
  const pathname = usePathname(); const [onlyUnread, setOnlyUnread] = useState(false); const [items, setItems] = useState(notifications); const [clearing, setClearing] = useState(false);
  useEffect(() => setItems(notifications), [notifications]);
  useEffect(() => { const update = (event: Event) => { const detail = (event as CustomEvent<{ id?: number; unread?: boolean; deleted?: boolean; cleared?: boolean }>).detail; if (!detail) return; if (detail.cleared) setItems([]); else if (detail.deleted && detail.id) setItems((current) => current.filter((item) => item.id !== detail.id)); else if (detail.id && detail.unread !== undefined) setItems((current) => current.map((item) => item.id === detail.id ? { ...item, u: detail.unread ? 1 : 0 } : item)); }; window.addEventListener("gutter:notifications-changed", update); return () => window.removeEventListener("gutter:notifications-changed", update); }, []);
  const id = Number(pathname.split("/")[2]); const list = items.filter((item) => !onlyUnread || item.u || item.id === id);
  const router = useRouter(); const toast = useToast();
  const open = useCallback((index: number) => { const item = list[index]; if (item) router.push(`/notifications/${item.id}`); }, [list, router]);
  const { containerRef, selectedIndex } = useListNavigation({ count: list.length, activeIndex: list.findIndex((item) => item.id === id), onOpen: open, openOnMove: id > 0, scope: id > 0 ? "desktop" : "all" });
  const clearAll = async () => { setClearing(true); try { const response = await fetch("/api/notifications", { method: "DELETE" }); if (!response.ok) throw new Error(); setItems([]); window.dispatchEvent(new CustomEvent("gutter:notifications-changed", { detail: { cleared: true } })); router.replace("/notifications"); router.refresh(); toast("All notifications cleared"); } catch { toast("Could not clear notifications"); } finally { setClearing(false); } };
  return <aside ref={containerRef} className="index" aria-label="Notifications"><div className="filters"><button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(!onlyUnread)}>Unread only</button><button disabled={clearing || items.length === 0} onClick={() => void clearAll()}>{clearing ? "Clearing…" : "Clear all"}</button></div><div className="idx-head"><span>No.</span><span>Notification</span><span /></div>{list.map((item, index) => <IndexRow item={item} selected={selectedIndex === index} navigationIndex={index} key={item.id} />)}{list.length === 0 ? <p className="desc">{onlyUnread && items.length > 0 ? "No unread notifications." : "No notifications to show."}</p> : null}</aside>;
}
