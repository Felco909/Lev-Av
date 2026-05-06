'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { popCrumb, markRestore } from '@/lib/nav-history';

type Props = {
  fallbackHref?: string;
  fallbackLabel?: string;
  className?: string;
  title?: string;
};

export default function SmartBackButton({
  fallbackHref = '/trips',
  className = 'p-2 hover:bg-muted rounded-lg transition',
  title = 'Назад',
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    const crumb = popCrumb();
    if (crumb?.href) {
      if (crumb.pageKey) markRestore(crumb.pageKey);
      router.push(crumb.href);
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button type="button" onClick={handleBack} className={className} title={title} aria-label={title}>
      <ArrowLeft className="w-4 h-4" />
    </button>
  );
}
