/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Expanse",
    description:
        "IDE visual para diseñar, desplegar y monitorear stacks de Docker Compose.",
    authors: [
        {
            name: "Dinámicas Electrónicas",
            url: "https://github.com/Dinamicas-Electronicas",
        },
    ],
    creator: "Dinámicas Electrónicas",
    publisher: "Dinámicas Electrónicas",
    robots: {
        index: false,
        follow: false,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // The actual <html>/<body> lives in app/[locale]/layout.tsx so `lang` and
    // the locale providers wrap the document exactly once (next-intl pattern).
    return children;
}