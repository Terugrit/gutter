import { NotificationIndex } from "./notification-index";
import { NotificationsShell } from "./notifications-shell";
import { getNotifications } from "@/lib/services/notifications";
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) { return <NotificationsShell index={<NotificationIndex notifications={await getNotifications()} />}>{children}</NotificationsShell>; }
