"use client";

/**
 * Tlač faktúry = tlač toho istého PDF, ktoré sa sťahuje (vytlačená a stiahnutá faktúra sú rovnaké).
 * PDF sa načíta do skrytého rámu a otvorí sa tlač; ak to prehliadač nedovolí, PDF sa otvorí v novej karte.
 */
export default function PrintButton({ label, pdfUrl }: { label: string; pdfUrl: string }) {
  const print = () => {
    const url = `${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}inline=1`;
    const old = document.getElementById("print-frame");
    old?.remove();
    const frame = document.createElement("iframe");
    frame.id = "print-frame";
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
      }
    };
    document.body.appendChild(frame);
  };
  return <button type="button" className="primary" onClick={print}>{label}</button>;
}
