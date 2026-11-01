"use client";

import { useActionState } from "react";
import { type TestState, testConnection } from "@/app/webmaster/backup/actions";

type Labels = { test: string; testing: string; ok: string; failed: string; steps: Record<string, string> };

/** Test spojenia so záložným úložiskom; výsledok jednotlivých krokov sa ukáže hneď pod tlačidlom. */
export default function BackupTest({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<TestState>(testConnection, null);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <div className="actions"><button disabled={pending}>{pending ? labels.testing : labels.test}</button></div>
      {state?.error && <p role="alert" className="alert">{labels.failed}: {state.error}</p>}
      {state?.steps && (
        <div role="status">
          <strong className={state.ok ? "ok-text" : "bad-text"}>{state.ok ? labels.ok : labels.failed}</strong>
          <ul className="test-steps">
            {state.steps.map((s) => (
              <li key={s.step} className={s.ok ? "good" : "bad"}>
                {s.ok ? "✓" : "✗"} {labels.steps[s.step] ?? s.step} ({s.ms} ms){s.error && `: ${s.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
