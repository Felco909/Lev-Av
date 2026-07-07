/**
 * Диагностика LAN/session для счёта/акта. Включить: TRIP_DOC_AUTH_DEBUG=1 в .env
 * В лог не пишутся значения Cookie — только факт наличия и длина.
 */
export function logTripDocAuthTrace(req: Request | undefined, session: any, context: string) {
  if (process.env.TRIP_DOC_AUTH_DEBUG !== '1') return;
  const h = req?.headers;
  const u = session?.user as Record<string, unknown> | undefined;
  const line = {
    context,
    host: h?.get('host') ?? null,
    forwarded: h?.get('x-forwarded-for') ?? null,
    origin: h?.get('origin') ?? null,
    referer: h?.get('referer')?.slice(0, 240) ?? null,
    cookieHeaderPresent: !!(h?.get('cookie')?.length),
    cookieHeaderLength: h?.get('cookie')?.length ?? 0,
    sessionUserPresent: !!session?.user,
    userId: u?.id ?? null,
    email: u?.email ?? null,
    role: u?.role ?? null,
  };
  console.warn('[TRIP_DOC_AUTH]', JSON.stringify(line));
}
