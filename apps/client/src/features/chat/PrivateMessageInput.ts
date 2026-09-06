import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { sendChat } from "@client/core/network/ServerConnection";

const submitted = new WeakMap<VarManager, {message:string;recipient:string}>();

/** Deduplicate at the send opcode, not by emptying the native input buffer. */
export function consumeSubmittedPrivateMessage(vars:VarManager,recipient:string,message:string):boolean {
    const entry=submitted.get(vars);submitted.delete(vars);
    return entry?.recipient===recipient && entry.message===message;
}

/** Submit before other listeners, but let script 681 enable Private chat and
 * perform its normal bookkeeping before it dismisses the prompt. */
export function submitPrivateMessageInput(vars:VarManager,keyTyped:number):boolean {
    submitted.delete(vars);
    if(keyTyped!==84 || vars.getVarcInt(5)!==6 || vars.getVarbit(4394)===1)return false;
    const message=vars.getVarcString(359),recipient=vars.getVarcString(360);
    if(!message?.trim() || !recipient?.trim())return false;
    if(!sendChat(message,"private",0,recipient))return false;
    submitted.set(vars,{message,recipient});
    return true;
}
