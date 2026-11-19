"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { Card, CardContent } from "@/components/ui/card";
import EmbedSignin from "@/components/display/embedSignin";

export default function Index() {


  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-full max-w-[480px]">
        <CardContent className="p-5">
          <EmbedSignin />
        </CardContent>
      </Card>
    </div>
  );
}