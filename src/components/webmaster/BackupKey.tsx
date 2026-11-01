"use client";

import { useActionState, useState } from "react";
import { type KeyState, keyAction } from "@/app/webmaster/backup/actions";
import ConfirmSubmit from "@/components/ConfirmSubmit";

type Labels = {
  keyId: string;
  set: string;
  noKey: string;
  warning: string;
  generate: string;
  generateQ: string;
  setOwn: string;
  ownPh: string;
  reveal: string;
  revealQ: string;
  shown: string;
  newSet: string;
  copy: string;
  copied: string;
  download: string;
  cancel: string;
  errors: Record<string, string>;
};

/** Kľúč zálohy: odtlačok, vytvorenie nového, vlastný kľúč a zobrazenie uloženého. */
export default function BackupKey({ keyId, setId, labels: l }: { keyId: string | null; setId: string | null; labels: Labels }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(keyAction, null);
  const [copied, setCopied] = useState(false);
  const shownId = state?.keyId ?? keyId;
  const file = state?.key
    ? `data:text/plain;charset=utf-8,${encodeURIComponent(`Robotka – backup key\nKey: ${state.key}\nFingerprint: ${shownId ?? ""}\n`)}`
    : null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted small-note">{l.warning}</p>
      <p>{shownId ? <>{l.keyId}: <code>{shownId}</code>{setId && <span className="muted"> · {l.set} {setId}</span>}</> : <strong>{l.noKey}</strong>}</p>

      {state?.error && <p role="alert" className="alert">{l.errors[state.error] ?? state.error}</p>}
      {state?.key && (
        <div className="stack" style={{ gap: 8 }} role="status">
          <strong>{l.shown}</strong>
          <div className="key-box">{state.key}</div>
          {state.newSet && <p className="muted small-note">{l.newSet}</p>}
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(state.key!).then(() => setCopied(true));
              }}
            >
              {copied ? l.copied : l.copy}
            </button>
            {file && <a className="button" href={file} download={`robotka-backup-key-${shownId}.txt`}>{l.download}</a>}
          </div>
        </div>
      )}

      <div className="actions">
        {keyId && (
          <form action={action}>
            <input type="hidden" name="action" value="reveal" />
            <ConfirmSubmit label={l.reveal} question={l.revealQ} yes={l.reveal} no={l.cancel} className={pending ? "disabled" : undefined} />
          </form>
        )}
        <form action={action}>
          <input type="hidden" name="action" value="generate" />
          {keyId
            ? <ConfirmSubmit label={l.generate} question={l.generateQ} yes={l.generate} no={l.cancel} />
            : <button className="primary" disabled={pending}>{l.generate}</button>}
        </form>
      </div>
      <form action={action} className="actions">
        <input type="hidden" name="action" value="set" />
        <input name="key" required minLength={43} maxLength={60} placeholder={l.ownPh} aria-label={l.setOwn} style={{ flex: "1 1 260px", width: "auto" }} autoComplete="off" spellCheck={false} />
        {keyId
          ? <ConfirmSubmit label={l.setOwn} question={l.generateQ} yes={l.setOwn} no={l.cancel} />
          : <button disabled={pending}>{l.setOwn}</button>}
      </form>
    </div>
  );
}
