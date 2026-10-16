import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100">
      <h2 className="text-2xl font-bold font-mono text-indigo-400">404 - Page Not Found</h2>
      <p className="mt-2 text-xs text-slate-400">The requested resource could not be found.</p>
      <Link
        href="/"
        className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition"
      >
        Return to Next.js Expert
      </Link>
    </div>
  );
}
