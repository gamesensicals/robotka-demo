import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { redirectIfLoggedIn } from "@/lib/guest";
import { isWebmasterLogin, startSession, verifyPassword } from "@/server/auth";
import { fail } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { membershipOf, userByEmail } from "@/server/queries";
import { blocked, failKey, hit } from "@/server/ratelimit";
import DemoBox from "@/components/DemoBox";

async function signIn(formData: FormData) {
  "use server";
  const ipKey = await failKey("login");
  if (blocked(ipKey, 10, 10 * 60_000)) fail("/login", "too_many");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // webmaster (účet z .env) spravuje všetky firmy a web
  if (await isWebmasterLogin(email, password)) {
    await startSession(WEBMASTER);
    redirect("/webmaster");
  }
  const user = userByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    hit(ipKey);
    fail("/login", "wrong_login");
  }
  // e-mailom sa prihlasujú len majitelia; člen tímu ide cez kód firmy
  const m = membershipOf(user.id);
  // zablokovaná firma: majiteľ sa prihlási (len k podpore), člen tímu nie
  if (m?.role === "member") fail("/login", m.company.blocked ? "company_blocked" : "team_login");
  await startSession(user.id);
  redirect("/");
}

export default async function LoginPage() {
  await redirectIfLoggedIn();
  const { t } = await getT();
  const l = t.login;
  return (
    <>
      <DemoBox />
      <form action={signIn} className="panel narrow">
        <h2 className="panel-title">{l.ownerTitle}</h2>
        <div className="panel-body">
          <fieldset>
            <legend>{l.legend}</legend>
            <div className="fields">
              <label className="field wide">{t.common.email} <input name="email" type="email" autoComplete="email" required /></label>
              <label className="field wide">{l.password} <input name="password" type="password" autoComplete="current-password" required /></label>
            </div>
          </fieldset>
          <div className="actions">
            <button className="primary">{l.signIn}</button>
          </div>
        </div>
      </form>
      <section className="panel narrow">
        <div className="panel-body actions spread">
          <span className="muted">{l.employeeQuestion}</span>
          <Link href="/team" className="button primary">{l.employeeLogin}</Link>
        </div>
      </section>
      <section className="panel narrow">
        <div className="panel-body actions spread">
          <span className="muted">{l.noAccount}</span>
          <a href="https://robotka.beer/request-account" className="button">{l.requestAccount}</a>
        </div>
      </section>
    </>
  );
}
