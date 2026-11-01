import type { ReactNode } from "react";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { addMember, removeMember, setMemberPassword, setMemberPerms, setMemberRole } from "@/app/admin/employees/actions";
import { PERM_GROUPS, PRESETS, type Perm, presetOf } from "@/lib/perms";
import { type Member, loginName } from "@/server/queries";

type Me = { id: string | null; isWebmaster: boolean; isOwner: boolean; perms: readonly Perm[] };

/**
 * Tím firmy: kto je kto, oprávnenia (rozbaľovacie pri každom členovi), nové heslo, zmena roly
 * a odobratie. Rovnaké pre majiteľa (Zamestnanci) aj webmastra (detail firmy).
 */
export default async function TeamTable({
  companyId,
  primaryOwnerId,
  members,
  me,
  back,
  extra,
  seatPrice,
}: {
  companyId: string;
  primaryOwnerId: string | null;
  members: Member[];
  me: Me;
  back: string;
  /** ďalšie tlačidlá pri človeku (webmaster: spraviť supermajiteľom) */
  extra?: (m: Member) => ReactNode;
  /** cena prevádzky za osobu (len pri cene na osobu), ukáže sa pri pridávaní */
  seatPrice?: string;
}) {
  const { t, date } = await getT();
  const e = t.employees;
  const cf = t.confirm;
  const boss = me.isWebmaster || me.isOwner; // smie všetko vrátane majiteľov
  const canTeam = boss || me.perms.includes("company.team");
  const mine = (p: Perm) => boss || me.perms.includes(p);
  const hidden = (
    <>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="company_id" value={companyId} />
    </>
  );

  return (
    <>
      <table className="members">
        <thead><tr><th>{e.login}</th><th>{e.roleAndPerms}</th><th>{e.since}</th><th>{e.actions}</th></tr></thead>
        <tbody>
          {members.map((m) => {
            const isPrimary = m.id === primaryOwnerId;
            const isMe = m.id === me.id;
            const canManage = canTeam && !isPrimary && !isMe && (boss || m.role !== "owner");
            const canRole = boss && !isPrimary && !isMe;
            // heslo supermajiteľovi nastaví len webmaster
            const canPassword = canManage || (me.isWebmaster && isPrimary);
            const preset = m.role === "member" ? presetOf(m.perms) : null;
            const summary = m.role === "owner" ? e.ownerAll : preset ? e.presets[preset] : e.permsCount(m.perms.length);
            return [
              <tr key={m.id}>
                <td>
                  <span className="row-title">{loginName(m)}</span>
                  {isMe && <span className="muted"> {e.you}</span>}
                  {isPrimary && <span className="badge badge-paid primary-badge">{e.primaryOwner}</span>}
                </td>
                <td>
                  {t.role[m.role]}
                  <span className="muted by">{summary}</span>
                </td>
                <td className="nowrap">{date(m.created_at)}</td>
                <td>
                  <div className="member-actions">
                    {canPassword && (
                      <details className="inline-details">
                        <summary className="button small">{e.setPassword}</summary>
                        <form action={setMemberPassword} className="actions">
                          {hidden}<input type="hidden" name="user_id" value={m.id} />
                          <input name="password" type="password" placeholder={e.newPassword} minLength={10} required autoComplete="new-password" />
                          <button className="small">{t.common.save}</button>
                        </form>
                      </details>
                    )}
                    {canRole && (
                      <details className="inline-details">
                        <summary className="button small">{e.changeRole}</summary>
                        <form action={setMemberRole} className="actions">
                          {hidden}<input type="hidden" name="user_id" value={m.id} />
                          <input type="hidden" name="role" value={m.role === "owner" ? "member" : "owner"} />
                          {m.role === "member" && !m.email && (
                            <input name="email" type="email" required placeholder={e.ownerEmail} aria-label={e.ownerEmail} autoComplete="off" />
                          )}
                          {m.role === "owner" && !m.username && (
                            <input name="username" required placeholder={t.team.username} aria-label={t.team.username} autoComplete="off" />
                          )}
                          <ConfirmSubmit
                            label={m.role === "owner" ? e.makeMember : e.makeOwner}
                            className="small"
                            question={m.role === "owner" ? cf.makeMemberQ(loginName(m)) : cf.makeOwnerQ(loginName(m))}
                            yes={m.role === "owner" ? e.makeMember : e.makeOwner}
                            no={cf.cancel}
                          />
                        </form>
                      </details>
                    )}
                    {extra?.(m)}
                    {canManage && (
                      <form action={removeMember}>
                        {hidden}<input type="hidden" name="user_id" value={m.id} />
                        <ConfirmSubmit label={e.remove} className="danger small" question={cf.removeQ(loginName(m))} yes={e.remove} no={cf.cancel} />
                      </form>
                    )}
                  </div>
                </td>
              </tr>,
              m.role === "member" && canManage && (
                <tr key={`${m.id}-perms`} className="perm-row">
                  <td colSpan={4}>
                    <details className="perms">
                      <summary>{e.perms}: {loginName(m)}</summary>
                      <form action={setMemberPerms}>
                        {hidden}<input type="hidden" name="user_id" value={m.id} />
                        <div className="perm-groups">
                          {PERM_GROUPS.map((g) => (
                            <fieldset key={g.key}>
                              <legend>{t.perms.groups[g.key]}</legend>
                              {g.perms.map((p) => {
                                const on = m.perms.includes(p);
                                return (
                                  <label key={p} className={`check${mine(p) ? "" : " muted"}`}>
                                    <input type="checkbox" name="perm" value={p} defaultChecked={on} disabled={!mine(p)} />
                                    {/* políčko, ktoré nesmiem meniť, sa odošle tak, ako je */}
                                    {!mine(p) && on && <input type="hidden" name="perm" value={p} />}
                                    {t.perms.labels[p]}
                                  </label>
                                );
                              })}
                            </fieldset>
                          ))}
                        </div>
                        {!boss && <p className="muted small-note">{e.onlyMine}</p>}
                        <div className="actions perm-actions">
                          <button className="primary small">{e.savePerms}</button>
                          <span className="muted">{e.usePreset}</span>
                          {(["worker", "manager"] as const).filter((k) => PRESETS[k].every(mine)).map((k) => (
                            <button key={k} name="preset" value={k} className="small">{e.presets[k]}</button>
                          ))}
                          {boss && <button name="preset" value="all" className="small">{e.presets.all}</button>}
                        </div>
                      </form>
                    </details>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>

      {canTeam && (
        <div className="panel-body add-member">
          <details className="create-member">
          <summary className="button">＋ {e.addMember}</summary>
          <form action={addMember}>
            {hidden}
            <fieldset>
              <legend>{e.addMember}</legend>
              <div className="fields">
                <label className="field">{t.team.username}
                  <input name="username" required minLength={3} maxLength={32} placeholder="jano.novak" autoComplete="off" />
                </label>
                <label className="field">{e.tempPassword}
                  <input name="password" type="password" required minLength={10} autoComplete="new-password" />
                </label>
                <label className="field">{e.presetLabel}
                  <select name="preset" defaultValue="worker">
                    {(["worker", "manager"] as const).filter((k) => PRESETS[k].every(mine)).map((k) => (
                      <option key={k} value={k}>{e.presets[k]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted small-note" style={{ marginTop: 10 }}>{e.memberHint}</p>
              {seatPrice && <p className="muted small-note" style={{ marginTop: 6 }}>{e.seatHint(seatPrice)}</p>}
              <div className="actions" style={{ marginTop: 12 }}><button className="primary">{e.addMember}</button></div>
            </fieldset>
          </form>
          </details>
          {boss && (
            <details className="create-owner">
              <summary className="button">＋ {e.addOwner}</summary>
              <form action={addMember}>
                {hidden}<input type="hidden" name="kind" value="owner" />
                <div className="fields">
                  <label className="field">{e.ownerEmail}<input name="email" type="email" required autoComplete="off" /></label>
                  <label className="field">{e.tempPassword}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
                </div>
                <p className="muted small-note" style={{ marginTop: 10 }}>{e.ownerHint}</p>
                {seatPrice && <p className="muted small-note" style={{ marginTop: 6 }}>{e.seatHint(seatPrice)}</p>}
                <div className="actions" style={{ marginTop: 12 }}><button className="primary">{e.addOwner}</button></div>
              </form>
            </details>
          )}
        </div>
      )}
      <div className="panel-body"><p className="muted small-note">{e.primaryHint}</p></div>
    </>
  );
}
