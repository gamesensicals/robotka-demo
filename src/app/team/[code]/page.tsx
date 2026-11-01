import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { redirectIfLoggedIn } from "@/lib/guest";
import { startSession, verifyPassword } from "@/server/auth";
import { fail } from "@/server/actions";
import { signedFileUrl } from "@/server/files";
import { codeKey, normalizeUsername } from "@/server/login-code";
import { companyByCode, userByUsername } from "@/server/queries";
import { blocked, failKey, hit } from "@/server/ratelimit";
import { TEAM_COOKIE } from "@/server/team";

// Prihlásenie zamestnancov, krok 2: logo a názov firmy + používateľské meno a heslo.
async function teamSignIn(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  const back = `/team/${encodeURIComponent(code)}`;
  const company = companyByCode(codeKey(code));
  if (!company) fail("/team", "bad_code");
  if (company.blocked) fail("/team", "company_blocked");
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  // limit neúspešných pokusov na IP aj na konkrétny účet (striedanie IP adries nepomôže)
  const ipKey = await failKey("login");
  const userKey = `team-user:${company.id}:${username}`;
  if (blocked(ipKey, 10, 10 * 60_000) || blocked(userKey, 10, 15 * 60_000)) fail(back, "too_many");
  const user = userByUsername(company.id, username);
  if (!user || !(await verifyPassword(String(formData.get("password") ?? ""), user.password_hash))) {
    hit(ipKey);
    hit(userKey);
    fail(back, "wrong_login");
  }
  await startSession(user.id);
  redirect("/");
}

async function changeCompany() {
  "use server";
  (await cookies()).delete(TEAM_COOKIE);
  redirect("/team");
}

export default async function TeamLogin({ params }: { params: Promise<{ code: string }> }) {
  await redirectIfLoggedIn();
  const [{ code }, { t }] = await Promise.all([params, getT()]);
  // aj priame skúšanie adries /team/<kód> sa počíta do limitu (len neplatné kódy)
  const ipKey = await failKey("team-code");
  if (blocked(ipKey, 20, 15 * 60_000)) redirect("/team?error=too_many");
  const company = companyByCode(codeKey(decodeURIComponent(code)));
  if (!company) {
    hit(ipKey);
    redirect("/team?error=bad_code");
  }
  const m = t.team;

  return (
    <>
      <form action={teamSignIn} className="panel narrow">
        <div className="team-brand">
          {company.logo_path && <img src={signedFileUrl(company.logo_path)} alt="" className="team-logo" />}
          <h2>{company.name}</h2>
          <p className="muted">{m.welcome}</p>
        </div>
        <div className="panel-body">
          <input type="hidden" name="code" value={company.login_code} />
          <fieldset>
            <legend>{m.loginLegend}</legend>
            <div className="fields">
              <label className="field wide">{m.username}
                <input name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </label>
              <label className="field wide">{t.login.password}
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
            </div>
          </fieldset>
          <div className="actions"><button className="primary">{t.login.signIn}</button></div>
        </div>
      </form>
      <form action={changeCompany} className="narrow actions spread">
        <span className="muted">{m.notYourCompany}</span>
        <button className="linklike">{m.changeCompany}</button>
      </form>
    </>
  );
}
