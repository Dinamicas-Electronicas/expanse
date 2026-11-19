import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
    return (
        <section className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-6xl font-black tracking-tighter text-slate-700">404</p>
            <h1 className="text-xl font-bold">Page not found</h1>
            <p className="max-w-md text-sm text-slate-400">
                The page you are looking for does not exist or was moved.
            </p>
            <Link
                href="/"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
            >
                Back home
            </Link>
        </section>
    );
}
