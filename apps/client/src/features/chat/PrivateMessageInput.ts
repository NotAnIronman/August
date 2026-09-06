import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { sendChat } from "@client/core/network/ServerConnection";

/** Native cache prompt contract (script 681): mode 6, body 359, recipient 360.
 * Submit before other onKey listeners can dismiss/reset the prompt. Emptying the
 * body makes the native submit a no-op; it still owns closing and redrawing it.
 */
export function submitPrivateMessageInput(vars:VarManager,keyTyped:number):boolean {
    if(keyTyped!==84 || vars.getVarcInt(5)!==6 || vars.getVarbit(4394)===1)return false;
    const message=vars.getVarcString(359),recipient=vars.getVarcString(360);
    if(!message?.trim() || !recipient?.trim())return false;
    if(!sendChat(message,"private",0,recipient))return false;
    vars.setVarcString(359,"");
    return true;
}
