export type GroundItemEditHit={x:number;y:number;width:number;height:number;name:string;list:"highlight"|"hide"};
/** Hit regions are replaced by each rendered frame, never inferred from labels. */
export const groundItemEditControls={hits:[] as GroundItemEditHit[], apply:undefined as undefined|((name:string,list:"highlight"|"hide")=>void)};
export function clickGroundItemEdit(x:number,y:number,scaleX=1,scaleY=1):boolean {
    // Overlay hit regions are framebuffer pixels; widget input can be logical pixels.
    x *= scaleX; y *= scaleY;
    const hit=[...groundItemEditControls.hits].reverse().find(h=>x>=h.x&&y>=h.y&&x<h.x+h.width&&y<h.y+h.height);
    if(!hit || !groundItemEditControls.apply)return false;
    groundItemEditControls.apply(hit.name,hit.list);return true;
}
