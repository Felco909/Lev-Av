'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { getTrail, truncateTrail, markRestore, Crumb } from '@/lib/nav-history';

type Props = {
  /** Label of the current (leaf) page shown as the last, non-clickable crumb. */
  current: string;
  className?: string;
};

export default function Breadcrumbs({ current, className }: Props) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  const router = useRouter();

  useEffect(() => {
    setTrail(getTrail());
  }, []);

  const handleClick = (i: number, c: Crumb) => {
    // Clicking the i-th crumb should leave the first i crumbs intact (drop the clicked one
    // and everything after), then navigate + mark the target page for state restore.
    truncateTrail(i);
    if (c.pageKey) markRestore(c.pageKey);
    router.push(c.href);
  };

  return (
    <nav className={`flex items-center flex-wrap gap-1 text-xs text-muted-foreground ${className ?? ''}`}>
      <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-primary transition">
        <Home className="w-3 h-3" /> Главная
      </Link>
      {trail.map((c, i) => (
        <span key={`${c.href}-${i}`} className="inline-flex items-center gap-1">
          <ChevronRight className="w-3 h-3 opacity-60" />
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handleClick(i, c); }}
            className="hover:text-primary transition"
          >
            {c.label}
          </button>
        </span>
      ))}
      <ChevronRight className="w-3 h-3 opacity-60" />
      <span className="text-foreground font-medium">{current}</span>
    </nav>
  );
}
