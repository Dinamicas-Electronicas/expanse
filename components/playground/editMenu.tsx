/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import useSelectionStore from "@/store/selection";
import {ReactElement} from "react";
import ServiceEditor from "@/components/playground/editor/serviceEditor";
import NetowrkEditor from "@/components/playground/editor/networkEditor";
import BindingEditor from "@/components/playground/editor/bindingEditor";
import VolumeEditor from "@/components/playground/editor/volumeEditor";
import EnvEditor from "@/components/playground/editor/envEditor";
import LabelEditor from "@/components/playground/editor/labelEditor";
import ComposeSettingEditor from "@/components/playground/editor/composeSettingEditor";


export default function EditMenu():ReactElement<any>{
    const {selectedId} = useSelectionStore();

    switch (selectedId.substring(0,3)){
        case "ser":
            return <ServiceEditor />
        case "net":
            return <NetowrkEditor />
        case "bin":
            return <BindingEditor />
        case "vol":
            return <VolumeEditor />
        case "env":
            return <EnvEditor />
        case "lab":
            return <LabelEditor />
        default:
            return (
                <ComposeSettingEditor />
            )
    }
}
