import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { getViewer } from "@/lib/company";
import { signOut } from "@/lib/auth-actions";

// Používateľ bez firmy (napr. ho odobrali). Firmy zakladá len webmaster.
export default async function NoCompany() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.isWebmaster) redirect("/webmaster");
  if (viewer.company) redirect("/");
  const { t } = await getT();
  return (
    <section className="panel narrow">
      <h2 className="panel-title">{t.onboarding.title}</h2>
      <div className="panel-body">
        <p>{t.onboarding.text}</p>
        <form action={signOut} className="actions"><button>{t.nav.logout}</button></form>
      </div>
    </section>
  );
}
