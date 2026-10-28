import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const viewport: Viewport = {
  themeColor: '#07090e',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Casper - AI-Powered Architecture & Context Compiler',
  description:
    'AI-Powered Codebase Architecture & Context Compiler specializing in Next.js App Router, Hono edge services, React Server Components, Server Actions, Route Handlers, and TypeScript.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Casper',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Casper - AI-Powered Architecture & Context Compiler',
    description:
      'AI-Powered Codebase Architecture & Context Compiler specializing in Next.js App Router, Hono edge services, React Server Components, Server Actions, Route Handlers, and TypeScript.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Casper - AI-Powered Architecture & Context Compiler',
    description:
      'AI-Powered Codebase Architecture & Context Compiler specializing in Next.js App Router, Hono edge services, React Server Components, Server Actions, Route Handlers, and TypeScript.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" data-theme="deepsea" suppressHydrationWarning>
      <head>
        {/* FOUC-prevention: paint the stored theme before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var k='casper-theme-v1';var r=localStorage.getItem(k);var t='deepsea';if(r){var v=JSON.parse(r);if(['solarized-light','solarized-dark','monokai','deepsea','seahorse','forest','hacker','microsoft','apple'].indexOf(v)>=0)t=v;}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=(t==='solarized-light'||t==='microsoft'||t==='apple')?'light':'dark';}catch(e){document.documentElement.dataset.theme='deepsea';}`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} bg-[var(--theme-bg)] text-[var(--theme-text)] min-h-screen antialiased selection:bg-indigo-500/30 selection:text-indigo-200 font-sans`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
