'use client';
import { useSearchParams } from 'next/navigation';
import TripForm from '../_components/trip-form';

export default function NewTripPage() {
  const searchParams = useSearchParams();
  const copyFrom = searchParams?.get('copyFrom') || undefined;
  return <TripForm copyFromId={copyFrom} />;
}
