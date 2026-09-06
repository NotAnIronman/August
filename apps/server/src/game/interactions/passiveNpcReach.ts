import type { PathService } from "@server/pathfinding/PathService";
import { CollisionFlag } from "@server/pathfinding/engine/flag/CollisionFlag";

/** Speech crosses furniture (e.g. Verzik's throne), not walls or unknown tiles.
 * This intentionally differs from projectile LoS, which blocks on furniture.
 */
export function passiveNpcRaycast(path:Pick<PathService,"getCollisionFlagAt">,
    from:{x:number;y:number;plane:number},to:{x:number;y:number},worldViewId:number):{clear:boolean;tiles:number} {
    const edge=(ax:number,ay:number,bx:number,by:number)=>{
        const a=path.getCollisionFlagAt(ax,ay,from.plane,worldViewId),b=path.getCollisionFlagAt(bx,by,from.plane,worldViewId);
        if(a===undefined || b===undefined)return false;
        const mask=bx>ax?[CollisionFlag.WALL_EAST,CollisionFlag.WALL_WEST]:bx<ax?[CollisionFlag.WALL_WEST,CollisionFlag.WALL_EAST]:
            by>ay?[CollisionFlag.WALL_NORTH,CollisionFlag.WALL_SOUTH]:[CollisionFlag.WALL_SOUTH,CollisionFlag.WALL_NORTH];
        return !(a&mask[0]) && !(b&mask[1]);
    };
    let x=from.x,y=from.y,tiles=0;
    while(x!==to.x || y!==to.y){
        const dx=Math.sign(to.x-x),dy=Math.sign(to.y-y),nx=x+dx,ny=y+dy;
        const clear=dx && dy?edge(x,y,nx,y)&&edge(x,y,x,ny)&&edge(nx,y,nx,ny)&&edge(x,ny,nx,ny):edge(x,y,nx,ny);
        if(!clear)return {clear:false,tiles};
        x=nx;y=ny;tiles++;
    }
    return {clear:true,tiles};
}
