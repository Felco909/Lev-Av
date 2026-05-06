'use client';
import Link from 'next/link';
import { ReactNode, MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { pushCrumb, captureAndSave } from '@/lib/nav-history';

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
  /** Label shown in breadcrumbs for the page we're leaving FROM. */
  fromLabel: string;
  /** Stable key for the page we're leaving FROM (used for state save/restore). */
  fromKey: string;
  /** Explicit href (with query string) to return to. Defaults to current pathname + query. */
  fromHref?: string;
  /** Optional extra click handler. */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export default function CrumbLink({
  href, children, className, title, fromLabel, fromKey, fromHref, onClick,
}: Props) {
  const pathname = usePathname();

  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    let resolvedFromHref = fromHref;
    if (!resolvedFromHref) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      resolvedFromHref = pathname + (search || '');
    }
    // Capture current page state (filters/scroll) into sessionStorage
    captureAndSave(fromKey);
    pushCrumb({ label: fromLabel, href: resolvedFromHref, pageKey: fromKey });
    onClick?.(e);
  };

  return (
    <Link href={href} className={className} title={title} onClick={handle}>
      {children}
    </Link>
  );
}
