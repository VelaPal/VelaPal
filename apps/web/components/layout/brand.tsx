import Image from "next/image";
import Link from "next/link";

export default function Brand({
  href = "/workspace",
  onNavigate,
}: {
  href?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="vp-brand"
      aria-label="VelaPal home"
    >
      <Image src="/velapal-logo.png" alt="" width={35} height={35} priority />
      <span>
        vela<span>pal</span>
        <i aria-hidden="true" />
      </span>
    </Link>
  );
}
