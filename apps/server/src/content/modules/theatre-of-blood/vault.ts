import type { InstanceAreaCopy } from "@server/world/InstancedAreaManager";
export const VAULT_STAIRS=32995, VAULT_CRYSTAL=32996;
export const VAULT_ENTRANCE={x:3237,y:4307,level:0} as const;
export const VAULT_CRYSTAL_TILE={x:3246,y:4315,level:0} as const;
export const VERZIK_STAIRS_TILE={x:3168,y:4326,level:0} as const;
export const VAULT_CHESTS=[{x:3234,y:4331,rotation:0},{x:3227,y:4328,rotation:3},
    {x:3242,y:4328,rotation:1},{x:3227,y:4323,rotation:3},{x:3241,y:4323,rotation:1}] as const;
export const VAULT_SCENE_BASE={x:3216,y:4296} as const;
export const VAULT_COPY:InstanceAreaCopy={sourceBaseX:3216,sourceBaseY:4296,widthChunks:5,heightChunks:6,
    destinationChunkX:0,destinationChunkY:0,sourcePlanes:[0,1,2,3]};
export const vaultDefinition=(id:string)=>`theatre-vault:${id}`;
export function chestId(own:boolean,unique:boolean,opened:boolean):number {
    return opened?(unique?41746:32994):own?(unique?32993:32992):(unique?32991:32990);
}
