import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: [
    // Все страницы приложения, кроме /login — раньше был ручной allowlist,
    // который со временем разошёлся с реальной структурой app/(app) (не хватало
    // agents, daily-reports, day-tasks и др.). Новые страницы теперь защищены
    // автоматически, без необходимости вписывать их сюда вручную.
    '/((?!login|api|_next/static|_next/image|favicon.ico).*)',
    // Все API-роуты, кроме NextAuth-машинерии (иначе сам логин сломается) и
    // /api/signup (уже проверяет роль внутри себя — исключён, чтобы при полном
    // отсутствии сессии он по-прежнему отдавал чистый JSON 401, а не редирект).
    '/api/((?!auth|signup).*)',
  ],
};
