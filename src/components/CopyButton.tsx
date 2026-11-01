"use client";

import { useState } from "react";

/** Malé tlačidlo, ktoré skopíruje text (IBAN, VS…) do schránky. Funguje aj bez HTTPS. */
export default function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } finally { ta.remove(); }
  };
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else fallback();
    } catch {
      fallback();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className="small copy-btn" onClick={copy} aria-label={`${label}: ${value}`}>
      {copied ? `✓ ${done}` : label}
    </button>
  );
}
