'use client';
import { useParams } from 'next/navigation';
import TripForm from '../../_components/trip-form';

export default function EditTripPage() {
  const params = useParams();
  return <TripForm tripId={params?.id as string} />;
}
