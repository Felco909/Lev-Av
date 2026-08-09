import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
          if (!user) return null;
          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) return null;
          return { id: user.id, email: user.email, name: user.fullName, role: user.role } as any;
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.roleCheckedAt = Date.now();
        return token;
      }
      // TMS-AUDIT-0010: токен живёт до 30 дней (default maxAge), а роль пишется в него только
      // при входе — понижение/деактивация пользователя не действовало до истечения токена.
      // Перечитываем роль из БД не чаще раза в минуту (не при каждом запросе — иначе лишний
      // SELECT на каждый page load/getServerSession).
      const lastChecked = typeof token.roleCheckedAt === 'number' ? token.roleCheckedAt : 0;
      if (Date.now() - lastChecked > 60_000 && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: token.id }, select: { role: true } });
          token.role = dbUser?.role ?? null; // null — пользователь удалён, assertRole везде отклонит
          token.roleCheckedAt = Date.now();
        } catch {
          // сбой БД — не рвём сессию, используем роль из уже выданного токена
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session?.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
