"use client";
import { Dock } from "@/components/dock";
import { Kapowarr } from "@/components/dashboard-actions";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useListNavigation } from "@/components/use-list-navigation";
export function NotificationDetailActions({ id, previousId, nextId, seriesId, disabled }: { id: number; previousId?: number; nextId?: number; seriesId?: string; disabled?: boolean }) {
  const [marked, setMarked] = useState(false); const [busy, setBusy] = useState<"read" | "delete" | null>(null); const toast = useToast(); const router = useRouter();
  const escape = useCallback(() => router.push("/notifications"), [router]);
  const open = useCallback((index: number) => { const target = index === 0 ? nextId : index === 2 ? previousId : undefined; if (target) router.push(`/notifications/${target}`); }, [nextId, previousId, router]);
  useListNavigation({ count: 3, activeIndex: 1, onOpen: open, onEscape: escape, openOnMove: true, scope: "mobile" });
  useEffect(() => { setMarked(false); void fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).then((response) => { if (response.ok) window.dispatchEvent(new CustomEvent("gutter:notifications-changed", { detail: { id, unread: false } })); }); }, [id]);
  const markUnread = async () => { setBusy("read"); try { const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unread: true }) }); if (!response.ok) throw new Error(); setMarked(true); window.dispatchEvent(new CustomEvent("gutter:notifications-changed", { detail: { id, unread: true } })); toast("Marked unread"); } catch { toast("Could not mark unread"); } finally { setBusy(null); } };
  const remove = async () => { setBusy("delete"); try { const response = await fetch(`/api/notifications/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error(); window.dispatchEvent(new CustomEvent("gutter:notifications-changed", { detail: { id, deleted: true } })); router.replace(nextId ? `/notifications/${nextId}` : previousId ? `/notifications/${previousId}` : "/notifications"); router.refresh(); toast("Notification deleted"); } catch { toast("Could not delete notification"); setBusy(null); } };
  return <Dock><Kapowarr className="btn primary" seriesId={seriesId} disabled={disabled || busy !== null} /><button className="btn" disabled={marked || busy !== null} onClick={() => void markUnread()}>{marked ? "Marked unread" : busy === "read" ? "Saving…" : "Mark unread"}</button><button className="btn" disabled={busy !== null} onClick={() => void remove()}>{busy === "delete" ? "Deleting…" : "Delete"}</button></Dock>;
}
