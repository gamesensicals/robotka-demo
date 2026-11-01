import { getViewer } from "@/lib/company";
import { getT } from "@/i18n";
import { ackNotice } from "@/app/notice-actions";
import { activeNotices, type Notice } from "@/server/queries";

/**
 * Oznamy od webmastra (napr. plánovaná údržba) pre prihlásených. Zbalené ako „Oznam“ –
 * po kliknutí sa rozbalí; ak to webmaster povolil, dá sa každý zavrieť „Rozumiem“.
 */
export default async function NoticeBar() {
  const viewer = await getViewer();
  if (!viewer || viewer.isWebmaster) return null;
  const notices = activeNotices(viewer.user.id, viewer.role);
  if (!notices.length) return null;
  const { t, lang, dateTime } = await getT();
  const textOf = (n: Notice) => (lang === "en" ? n.text_en : lang === "cs" ? n.text_cs : n.text_sk) || n.text_sk || n.text_en || n.text_cs || "";
  return (
    <details className="notice-drop no-print">
      <summary>
        <span className="notice-icon" aria-hidden>!</span>
        {t.notices.label(notices.length)}
      </summary>
      <div className="notice-list">
        {notices.map((n) => (
          <div key={n.id} className="notice-item">
            <p className="notice-text">{textOf(n)}</p>
            <div className="notice-foot">
              <span className="muted">{t.notices.until(dateTime(n.ends_at))}</span>
              {!!n.dismissible && (
                <form action={ackNotice}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="small">{t.notices.understood}</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
