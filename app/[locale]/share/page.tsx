/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import AsyncReadOnlyPlayground from "@/components/playground/asyncReadonlyPlayground";
import SharePasswordForm from "@/components/playground/sharePasswordForm";
import { getShareAccessState } from "@/actions/composeActions";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";

type SP = Promise<{ [key: string]: string | string[] | undefined }>

export default async function Page({ searchParams }: { searchParams: SP }) {

    const sp = await searchParams
    const id = sp.id
    const name = sp.name
    const shareId = id?.toString() || ""
    const access = shareId ? await getShareAccessState(shareId) : { status: 'missing' as const }

    return (
        <section className="flex h-full flex-grow justify-center items-center">
            <div className='flex flex-col w-full h-full'>
                <span className="flex flex-row items-center justify-between p-10">
                    {name &&
                        <p className='text-2xl font-bold'>
                            {name}
                        </p>}
                    <p className='text-sm text-slate-500'>
                        Created with <Link className="underline font-bold" href={"/"}>Expanse ❤️</Link>
                        {' · '}Programa de Dinámicas Electrónicas ·{' '}
                        <a className="underline" href="mailto:dinamicas.electronicas@gmail.com">
                            dinamicas.electronicas@gmail.com
                        </a>
                    </p>
                </span>
                {access.status === 'locked' ? (
                    <SharePasswordForm shareId={shareId} />
                ) : (
                    <Suspense fallback={<Skeleton className="shadow flex mx-10 h-4/5 rounded-xl justify-center items-center" > Loading</Skeleton>}>
                        <AsyncReadOnlyPlayground shareId={shareId} options={{
                            className: "shadow flex mx-10 h-4/5 rounded-xl border-2 border-slate-100"
                        }} />
                    </Suspense>
                )}
            </div>
        </section>
    )
}