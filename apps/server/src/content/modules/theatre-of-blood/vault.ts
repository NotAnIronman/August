import type { InstanceAreaCopy } from "@server/world/InstancedAreaManager";
import { THEATRE_ARENAS } from "./arenas";
export const VAULT_STAIRS=32995, VAULT_CRYSTAL=32996;
export const THEATRE_REWARD_CHEST=41437;
/** User-confirmed exterior reward chest; northern chest remains death storage. */
export const THEATRE_REWARD_TILE={x:3650,y:3217,level:0} as const;
export const VAULT_ENTRANCE={x:3237,y:4307,level:0} as const;
export const VAULT_CRYSTAL_TILE={x:3246,y:4315,level:0} as const;
export const VERZIK_STAIRS_TILE={x:THEATRE_ARENAS.verzik.boss.x,y:THEATRE_ARENAS.verzik.boss.y,level:0} as const;
export const VAULT_CHESTS=[{x:3233,y:4331,rotation:0},{x:3226,y:4327,rotation:3},
    {x:3240,y:4329,rotation:1},{x:3226,y:4323,rotation:3},{x:3240,y:4325,rotation:1}] as const;
export const VAULT_SCENE_BASE={x:3216,y:4296} as const;
export const VAULT_COPY:InstanceAreaCopy={sourceBaseX:3216,sourceBaseY:4296,widthChunks:5,heightChunks:6,
    destinationChunkX:0,destinationChunkY:0,sourcePlanes:[0,1,2,3]};
export const vaultDefinition=(id:string)=>`theatre-vault:${id}`;
export function chestId(own:boolean,unique:boolean,opened:boolean):number {
    return opened?(unique?41746:32994):own?(unique?32993:32992):(unique?32991:32990);
}
