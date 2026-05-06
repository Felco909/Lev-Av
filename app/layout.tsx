import type { Metadata } from 'next';
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';

export const dynamic = 'force-dynamic';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'TMS - Система управления заявками',
  description: 'Транспортно-логистическая CRM система',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: { images: ['/og-image.png'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${dmSans.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
