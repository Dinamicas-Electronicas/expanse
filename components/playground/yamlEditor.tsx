/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {Editor} from "@monaco-editor/react";
import {useComposeStore} from "@/store/compose";
import {Translator} from "expanse-docker-lib";
import YAML from 'yaml'

export default function YamlEditor(){

    const {compose} = useComposeStore()

    function getComposeValue():string{
        let result = ""
        const translator = new Translator(compose)
        result = YAML.stringify(translator.toDict())
        return result
    }

    return(
            <Editor
                width="w-full"
                height="60vh"
                defaultLanguage="yaml"
                defaultValue={getComposeValue()}
            />
    )
}