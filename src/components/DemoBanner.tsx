import { getT } from "@/i18n";
import { nextReset, resetEvery } from "@/server/demo";

/** Pruh navrchu každej stránky: je to demo a kedy sa vráti do pôvodného stavu. */
export default async function DemoBanner() {
  const { t, locale } = await getT();
  const at = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" }).format(new Date(nextReset()));
  return (
    <div className="demo-banner no-print" role="note">
      <strong>{t.demo.bannerTitle}</strong> <span>{t.demo.banner(at, resetEvery(t))}</span>{" "}
      <a href="https://robotka.beer/request-account">{t.demo.ownAccount}</a>
    </div>
  );
}
