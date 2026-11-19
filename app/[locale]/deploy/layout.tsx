"use server"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {ReactNode} from "react";
import ClientLayout from "@/components/ui/UnifiedLayout";

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ClientLayout version={process.env.NEXT_PUBLIC_VERSION || "1.0.0"}>
      {children}
    </ClientLayout>
  );
}
