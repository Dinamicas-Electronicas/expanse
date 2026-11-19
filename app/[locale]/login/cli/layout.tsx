/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import React from "react";
import {Metadata} from "next";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata(
): Promise<Metadata> {
    // read route params
    return {
        "robots" : "noindex, nofollow"
    }
}

export default function Layout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            {children}
        </>
    );
}
