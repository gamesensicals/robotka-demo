import { redirect } from "next/navigation";
import { getViewer } from "@/lib/company";

/** Prihlásený používateľ nemá čo robiť na prihlasovacej stránke: pošli ho do aplikácie. */
export async function redirectIfLoggedIn() {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.isWebmaster ? "/webmaster" : "/");
}
