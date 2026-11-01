import { config } from "@/server/config";
import { headers } from "next/headers";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import TeamTable from "@/components/team/TeamTable";
import { listMembers } from "@/server/queries";
import { newCompanyCode } from "./actions";

const BACK = "/admin/employees";

export default async function Employees() {
  const [{ company, user, role, perms, has }, { t }, h] = await Promise.all([requirePerm("company.team", "company.code"), getT(), headers()]);
  const e = t.employees;
  const origin = config("app_url")?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const teamLink = `${origin}/team/${company.login_code}`;

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: e.title }]} />
      <section className="panel">
        <h2 className="panel-title">{t.team.title}</h2>
        <dl className="stats">
          <dt>{t.team.code}</dt><dd className="code-box">{company.login_code}</dd>
          <dt>{e.loginLink}</dt><dd className="break"><a href={teamLink}>{teamLink}</a></dd>
        </dl>
        <div className="panel-body">
          <p className="muted">{e.codeHint}</p>
          {has("company.code") && (
            <form action={newCompanyCode} className="actions">
              <input type="hidden" name="back" value={BACK} />
              <ConfirmSubmit label={e.newCode} className="danger" question={t.confirm.newCodeQ} yes={e.newCode} no={t.confirm.cancel} />
              <span className="muted">{e.newCodeHint}</span>
            </form>
          )}
        </div>
      </section>

      {has("company.team") && (
        <section className="panel">
          <h2 className="panel-title">{e.title}</h2>
          <TeamTable
            companyId={company.id}
            primaryOwnerId={company.primary_owner_id}
            members={listMembers(company.id)}
            me={{ id: user.id, isWebmaster: false, isOwner: role === "owner", perms }}
            back={BACK}
          />
        </section>
      )}
    </>
  );
}
