'use client';

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';

export default function LocaleError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Keep the raw error out of the UI; it may contain internal details.
        console.error('[UI] Unhandled error', error.digest ?? error.name);
    }, [error]);

    return (
        <section className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 className="text-2xl font-black uppercase tracking-tight">Something went wrong</h1>
            <p className="max-w-md text-sm text-slate-400">
                The page could not be rendered. You can retry or go back to the dashboard.
            </p>
            {error.digest && (
                <code className="rounded bg-white/5 px-2 py-1 text-xs text-slate-500">ref: {error.digest}</code>
            )}
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
                >
                    Retry
                </button>
                <Link
                    href="/dashboard"
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/5"
                >
                    Dashboard
                </Link>
            </div>
        </section>
    );
}
