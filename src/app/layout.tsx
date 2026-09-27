import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";
import { ToastProvider } from "@/components/toast";
import { TopBar } from "@/components/top-bar";
import { getAttentionCount } from "@/lib/services/attention";
import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gutter",
  applicationName: "Gutter",
  appleWebApp: { capable: true, title: "Gutter" },
  icons: { apple: "/apple-touch-icon.png" },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#eb5e28",
  width: "device-width",
  initialScale: 1,
};

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-playfair",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const attentionCount = await getAttentionCount();

  return (
    <html lang="en" className={playfair.variable}>
      <body data-attention-count={attentionCount}>
        <ToastProvider>
          <TopBar attentionCount={attentionCount} />
          {children}
          <TabBar attentionCount={attentionCount} />
        </ToastProvider>
      </body>
    </html>
  );
}
