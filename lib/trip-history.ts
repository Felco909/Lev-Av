import { prisma } from '@/lib/prisma';

export async function recordTripHistory(
  tripId: string,
  action: string,
  userId: string | null,
  userName: string | null,
  changes?: { field: string; oldValue?: string | null; newValue?: string | null }[]
) {
  try {
    if (changes && changes.length > 0) {
      await prisma.tripHistory.createMany({
        data: changes.map(c => ({
          tripId,
          userId,
          userName,
          action,
          field: c.field,
          oldValue: c.oldValue ?? null,
          newValue: c.newValue ?? null,
        })),
      });
    } else {
      await prisma.tripHistory.create({
        data: { tripId, userId, userName, action },
      });
    }
  } catch (e) {
    console.error('Failed to record trip history:', e);
  }
}

export function diffFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  for (const f of fields) {
    const o = String(oldObj[f] ?? '');
    const n = String(newObj[f] ?? '');
    if (o !== n) {
      changes.push({ field: f, oldValue: o || null, newValue: n || null });
    }
  }
  return changes;
}
