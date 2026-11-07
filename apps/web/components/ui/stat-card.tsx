import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
type StatCardProps = {
  label: string;
  value: string;
  description: string;
  icon?: LucideIcon;
  href?: string;
  accent?: boolean;
};
export default function StatCard({
  label,
  value,
  description,
  icon: Icon,
  href,
  accent = false,
}: StatCardProps) {
  const content = (
    <>
      <span className="vp-metric-label">
        {label}
        {Icon && <Icon size={15} strokeWidth={1.6} aria-hidden="true" />}
      </span>
      <strong>{value}</strong>
      <span className="vp-metric-description">
        {description}
        {href && <ArrowUpRight size={12} aria-hidden="true" />}
      </span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`vp-metric${accent ? " vp-metric-accent" : ""}`}
    >
      {content}
    </Link>
  ) : (
    <article className={`vp-metric${accent ? " vp-metric-accent" : ""}`}>
      {content}
    </article>
  );
}
