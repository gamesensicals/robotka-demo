"use client";

import { useRef } from "react";

type Props = {
  label: string;
  question: string;
  yes: string;
  no: string;
  className?: string;
  /** voliteľne iná server action ako má formulár (napr. Zmazať vedľa Uložiť) */
  formAction?: (formData: FormData) => void | Promise<void>;
};

/** Tlačidlo, ktoré pred odoslaním formulára opýta „Naozaj…?“ (Áno / Zrušiť). */
export default function ConfirmSubmit({ label, question, yes, no, className, formAction }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>{label}</button>
      {/* skryté skutočné odoslanie (zachová formAction) */}
      <button type="submit" ref={submit} formAction={formAction} hidden tabIndex={-1} aria-hidden />
      <dialog ref={dialog} className="confirm" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <p>{question}</p>
        <div className="actions">
          <button type="button" onClick={() => dialog.current?.close()} autoFocus>{no}</button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              dialog.current?.close();
              submit.current?.form?.requestSubmit(submit.current);
            }}
          >
            {yes}
          </button>
        </div>
      </dialog>
    </>
  );
}
