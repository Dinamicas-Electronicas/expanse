/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import type { WithId, Document } from "mongodb";
import {Compose} from "expanse-docker-lib";

export interface User extends WithId<Document> {
    email: string,
    password: string,
    companyType: string,
    termsAccepted: boolean,
    brevoId: string|null
}

export interface RegisterCompose extends WithId<Document> {
    userId: string
    data: Compose
}