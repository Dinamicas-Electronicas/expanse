import {getComposeByShareId} from "@/actions/composeActions";
import ReadOnlyPlayGround from "@/components/playground/readonlyPlayground";
import {DetailedHTMLProps, HTMLAttributes} from "react";
import {ReactFlowProvider} from "@xyflow/react";

export default async function AsyncReadOnlyPlayground({shareId,options}:{shareId:string,options?:DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>}){

    if(!shareId || shareId.length < 24){
        return (
            <div {...options}>
                The share Id is incorrect
            </div>
        )
    }

    const compose = await getComposeByShareId(shareId)
    const sharedCompose = compose?.data?.[0]

    if (!sharedCompose) {
        return (
            <div {...options} className={`${options?.className ?? ''} flex items-center justify-center`}>
                <div className="flex flex-col gap-2 items-center p-6 text-center">
                    <p className="text-lg font-bold">Shared project not found</p>
                    <p className="text-sm text-slate-400">
                        This link is invalid or the share is no longer public.
                    </p>
                </div>
            </div>
        )
    }

    return(
        <div {...options}>
            <ReactFlowProvider>
                <ReadOnlyPlayGround compose={sharedCompose.data} positionMap={sharedCompose.metadata} />
            </ReactFlowProvider>
        </div>
    )
}