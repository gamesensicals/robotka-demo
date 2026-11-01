/** Malý štvorček vľavo v riadku tabuľky: modrý = aktívne, sivý = hotové/nič nové. */
export default function StatusDot({ active }: { active: boolean }) {
  return <span className={active ? "dot dot-on" : "dot"} aria-hidden />;
}
