import { getT } from "@/i18n";
import type { TicketMessage } from "@/server/queries";

/** Vlákno správ chatu podpory. `mine` = kto sa pozerá (jeho správy sú vpravo). */
export default async function Thread({ messages, mine }: { messages: TicketMessage[]; mine: "company" | "webmaster" }) {
  const { t, locale } = await getT();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="thread">
      {messages.map((m) => {
        const own = (mine === "webmaster") === !!m.from_webmaster;
        return (
          <li key={m.id} className={own ? "own" : m.from_webmaster ? "wm" : undefined}>
            <div className="msg-meta">
              <strong>{m.from_webmaster ? t.support.webmaster : m.author_name}</strong>
              {!m.from_webmaster && m.author_role && <span className="muted">{t.role[m.author_role]}</span>}
              <span className="muted">{fmt.format(new Date(m.created_at))}</span>
            </div>
            <div className="msg-body">{m.body}</div>
          </li>
        );
      })}
    </ol>
  );
}
