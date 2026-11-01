import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { redirectIfLoggedIn } from "@/lib/guest";
import { fail } from "@/server/actions";
import { codeKey } from "@/server/login-code";
import { companyByCode } from "@/server/queries";
import { blocked, failKey, hit } from "@/server/ratelimit";
import { TEAM_COOKIE, TEAM_COOKIE_DAYS } from "@/server/team";
import DemoBox from "@/components/DemoBox";

// Prihlásenie zamestnancov, krok 1: kód firmy.
async function enterCode(formData: FormData) {
  "use server";
  // obmedzenie pokusov, aby sa kódy nedali skúšať naslepo
  const ipKey = await failKey("team-code");
  if (blocked(ipKey, 20, 15 * 60_000)) fail("/team", "too_many");
  const company = companyByCode(codeKey(String(formData.get("code") ?? "")));
  if (!company) {
    hit(ipKey);
    fail("/team", "bad_code");
  }
  (await cookies()).set(TEAM_COOKIE, company.login_code, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: TEAM_COOKIE_DAYS * 86400,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  });
  redirect(`/team/${company.login_code}`);
}

export default async function TeamCode({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await redirectIfLoggedIn();
  const [{ error }, { t }, jar] = await Promise.all([searchParams, getT(), cookies()]);
  // zapamätaná firma -> rovno na jej prihlásenie (okrem prípadu, keď sa práve vraciame s chybou)
  const remembered = jar.get(TEAM_COOKIE)?.value;
  if (remembered && !error && companyByCode(codeKey(remembered))) redirect(`/team/${remembered}`);
  const m = t.team;

  return (
    <>
      <DemoBox />
      <form action={enterCode} className="panel narrow">
        <h2 className="panel-title">{m.title}</h2>
        <div className="panel-body">
          <fieldset>
            <legend>{m.codeLegend}</legend>
            <label className="field">{m.code}
              <input name="code" required autoComplete="organization" autoCapitalize="none" spellCheck={false} placeholder={m.codePlaceholder} />
            </label>
            <p className="muted" style={{ marginTop: 12 }}>{m.codeHint}</p>
          </fieldset>
          <div className="actions"><button className="primary">{m.continue}</button></div>
        </div>
      </form>
      <section className="panel narrow">
        <div className="panel-body actions spread">
          <span className="muted">{m.ownerQuestion}</span>
          <Link href="/login" className="button">{m.ownerLogin}</Link>
        </div>
      </section>
    </>
  );
}
