"use server"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

export default async function CoreBanner() {

    if(!process.env.CORE_ONLY){
        return <></>
    }

    return (
        <div className="flex flex-row w-full bg-blue-100 items-center py-1 px-10 justify-between">
            <span></span>
            <p>🔒 This instance is self-hosted. 🔒</p>
            <span></span>
        </div>
    );
}
