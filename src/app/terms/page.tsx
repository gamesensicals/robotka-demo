import { redirect } from "next/navigation";
import { MAIN_TERMS } from "@/lib/main-site";

// DEMO: podmienky platia z ostrej Robotky – /terms presmeruje na robotka.beer/terms.
export default function Terms() {
  redirect(MAIN_TERMS);
}
