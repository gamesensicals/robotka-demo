import Link from "next/link";

// Logo je zároveň doména: robotka.beer
export default function Logo() {
  return (
    <Link href="/" className="logo" aria-label="robotka.beer">
      robotka<span>.beer</span>
    </Link>
  );
}
