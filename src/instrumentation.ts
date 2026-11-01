// DEMO: pri štarte nahrá ukážkové dáta a potom ich každú celú hodinu vráti do pôvodného stavu.
// Bez hubu a bez e-mailov. Údržba (mesačná uzávierka, chaty…) beží ako v ostrej Robotke.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startDemoReset } = await import("./server/demo");
    const { applyPriceChanges, closeBillingMonths, purgeDueInvoices, maintainTickets, maintainRequests } = await import("./server/credits");
    startDemoReset();
    const maintenance = () => void applyPriceChanges().then(closeBillingMonths).then(purgeDueInvoices).then(maintainTickets).then(maintainRequests);
    setTimeout(maintenance, 15_000);
    setInterval(maintenance, 10 * 60_000);
  }
}
