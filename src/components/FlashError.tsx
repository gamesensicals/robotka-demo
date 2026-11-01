"use client";

import { useSearchParams } from "next/navigation";

/** Hláška nad stránkou: ?error=kód (červená) alebo ?ok=kód (zelená) po server action. */
export default function FlashError({ messages, ok }: { messages: Record<string, string>; ok: Record<string, string> }) {
  const params = useSearchParams();
  const error = params.get("error");
  const done = params.get("ok");
  if (error) return <p role="alert" className="alert flash">{messages[error] ?? messages.invalid}</p>;
  if (done && ok[done]) return <p role="status" className="notice flash">{ok[done]}</p>;
  return null;
}
