import { Suspense, type ReactNode } from "react";
import { getT } from "@/i18n";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FlashError from "@/components/FlashError";
import NoticeBar from "@/components/NoticeBar";
import DemoBanner from "@/components/DemoBanner";
import "./globals.css";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: "Robotka – demo", description: t.app.description, robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getT();
  return (
    <html lang={lang}>
      <body>
        <div className="shell">
          <DemoBanner />
          <SiteHeader />
          <main>
            <NoticeBar />
            <Suspense><FlashError messages={t.errors} ok={t.ok} /></Suspense>
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
