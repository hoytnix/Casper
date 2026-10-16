import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Next.js Expert - AI-Powered Next.js Architecture & Context Compiler',
  description:
    'AI-Powered Next.js Architecture & Context Compiler specializing in App Router conventions, React Server Components, Server Actions, Route Handlers, and TypeScript.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NextExpert',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Next.js Expert - AI-Powered Next.js Architecture & Context Compiler',
    description:
      'AI-Powered Next.js Architecture & Context Compiler specializing in App Router conventions, React Server Components, Server Actions, Route Handlers, and TypeScript.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Next.js Expert - AI-Powered Next.js Architecture & Context Compiler',
    description:
      'AI-Powered Next.js Architecture & Context Compiler specializing in App Router conventions, React Server Components, Server Actions, Route Handlers, and TypeScript.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body
        suppressHydrationWarning
        className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-indigo-500/30 selection:text-indigo-200 font-sans"
      >
        {children}
      </body>
    </html>
  );
}
