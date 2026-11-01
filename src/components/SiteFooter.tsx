import { getT, LANGS, LANG_LABELS } from "@/i18n";
import { setLang } from "@/i18n/actions";
import { MAIN_TERMS } from "@/lib/main-site";

export default async function SiteFooter() {
  const { t, lang } = await getT();
  return (
    <footer className="site-foot no-print">
      <div className="foot-left">
        <p>Robotka {new Date().getFullYear()}</p>
        <a href={MAIN_TERMS}>{t.app.terms}</a>
      </div>
      <form action={setLang} className="langs">
        <span className="muted">{t.app.language}:</span>
        {LANGS.map((l) => (
          <button key={l} name="lang" value={l} className="linklike" aria-current={l === lang ? "true" : undefined}>
            {LANG_LABELS[l]}
          </button>
        ))}
      </form>
    </footer>
  );
}
