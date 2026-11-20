"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { unlockShare } from "@/actions/composeActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export default function SharePasswordForm({ shareId }: { shareId: string }) {
    const t = useTranslations('share');
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await unlockShare(shareId, password);
            if (result.ok) {
                router.refresh();
            } else {
                setError(result.error || t('invalidPassword'));
            }
        } catch {
            setError(t('invalidPassword'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-10 my-10 flex flex-1 items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-8">
            <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="rounded-full bg-slate-100 p-3">
                        <Lock className="h-5 w-5 text-slate-600" />
                    </div>
                    <h1 className="text-lg font-bold text-slate-900">{t('protectedTitle')}</h1>
                    <p className="text-sm text-slate-500">{t('protectedDescription')}</p>
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="share-password">{t('password')}</Label>
                    <Input
                        id="share-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="off"
                        required
                    />
                </div>
                {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
                <Button type="submit" disabled={loading || !password}>
                    {loading ? t('unlocking') : t('unlock')}
                </Button>
            </form>
        </div>
    );
}
