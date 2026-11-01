import { getT } from "@/i18n";
import { demoSignIn } from "@/app/demo-actions";
import { DEMO_COMPANY_ID, DEMO_MEMBERS, DEMO_OWNER } from "@/server/demo-seed";
import { getCompany } from "@/server/queries";
import { ensureSeeded } from "@/server/sync";
import { resetEvery } from "@/server/demo";

/** Úvod dema: prihlasovacie údaje a prihlásenie jedným klikom. */
export default async function DemoBox() {
  await ensureSeeded();
  const { t } = await getT();
  const d = t.demo;
  const code = getCompany(DEMO_COMPANY_ID)?.login_code ?? "–";
  const [maria, jozef] = DEMO_MEMBERS;
  const row = (who: string, title: string, desc: string, login: React.ReactNode) => (
    <div className="demo-account">
      <div>
        <strong>{title}</strong>
        <span className="muted by">{desc}</span>
        <div className="demo-creds">{login}</div>
      </div>
      <form action={demoSignIn}>
        <input type="hidden" name="who" value={who} />
        <button className="primary">{d.signInAs}</button>
      </form>
    </div>
  );
  return (
    <section className="panel narrow demo-box">
      <h2 className="panel-title">{d.title}</h2>
      <div className="panel-body">
        <p>{d.intro}</p>
        {row(DEMO_OWNER.id, d.owner, d.ownerDesc, <>
          <span>{d.email}: <code>{DEMO_OWNER.email}</code></span>
          <span>{d.password}: <code>{DEMO_OWNER.password}</code></span>
        </>)}
        {row(maria.id, d.manager, d.managerDesc, <>
          <span>{d.code}: <code>{code}</code></span>
          <span>{d.username}: <code>{maria.username}</code></span>
          <span>{d.password}: <code>{maria.password}</code></span>
        </>)}
        {row(jozef.id, d.worker, d.workerDesc, <>
          <span>{d.code}: <code>{code}</code></span>
          <span>{d.username}: <code>{jozef.username}</code></span>
          <span>{d.password}: <code>{jozef.password}</code></span>
        </>)}
        <p className="muted small-note">{d.resetNote(resetEvery(t))}</p>
      </div>
    </section>
  );
}
