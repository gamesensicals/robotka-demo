"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Po otvorení chatu s neprečítanými správami ich označí ako prečítané (a obnoví počítadlo v menu). */
export default function MarkRead({ action, ticketId }: { action: (ticketId: string) => Promise<void>; ticketId: string }) {
  const router = useRouter();
  useEffect(() => {
    void action(ticketId).then(() => router.refresh());
  }, [action, ticketId, router]);
  return null;
}
