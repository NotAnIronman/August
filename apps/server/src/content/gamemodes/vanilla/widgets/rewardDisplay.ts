import { REWARD_DISPLAY_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { openUiPanel, packUid } from "@server/content/gamemodes/vanilla/uikit/panelData";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices, IScriptRegistry } from "@server/game/scripts/types";

export const REWARD_DISPLAY_SLOT_BASE = 1000;
// Matches the client's 4x4 grid in rewardDisplayPanel.ts.
const REWARD_DISPLAY_CAPACITY = 16;

export type VisualReward = { itemId: number; quantity: number };
export type RewardDisplayOptions = {
    source?: "barrows" | "lunar" | "theatre";
    claim?: (destination:"inventory"|"bank"|"destroy", slot?:number)=>void;
};
const claims=new WeakMap<PlayerState,NonNullable<RewardDisplayOptions["claim"]>>();

export function registerRewardDisplayActions(registry:IScriptRegistry):void {
    const dispatch=(player:PlayerState,services:ScriptServices,destination:"inventory"|"bank",slot?:number)=>{
        if(!services.dialog.getInterfaceService()?.isModalOpen(player,REWARD_DISPLAY_PANEL_GROUP_ID))return;
        claims.get(player)?.(destination,slot);
    };
    registry.onButton(REWARD_DISPLAY_PANEL_GROUP_ID,852,({player,services})=>dispatch(player,services,"inventory"));
    registry.onButton(REWARD_DISPLAY_PANEL_GROUP_ID,854,({player,services})=>dispatch(player,services,"bank"));
    registry.onButton(REWARD_DISPLAY_PANEL_GROUP_ID,858,({player,services})=>{
        if(!services.dialog.getInterfaceService()?.isModalOpen(player,REWARD_DISPLAY_PANEL_GROUP_ID))return;
        const claim=claims.get(player);
        if(!claim)return;
        services.dialog.openDialogOptions(player,{id:"reward-destroy-confirm",title:"Permanently destroy all remaining loot?",
            options:["Cancel","Yes, destroy it."],onSelect:choice=>{
                // A replaced reward window invalidates this confirmation.
                if(choice===1 && claims.get(player)===claim)claim("destroy");
            }});
    });
    for(let slot=0;slot<REWARD_DISPLAY_CAPACITY;slot++)for(const opId of [1,2])registry.registerWidgetAction({
        widgetId:packUid(REWARD_DISPLAY_PANEL_GROUP_ID,REWARD_DISPLAY_SLOT_BASE+slot*2+1),opId,
        handler:({player,services})=>dispatch(player,services,opId===1?"inventory":"bank",slot),
    });
}

/** Shared presentation; optional claim callbacks retain ownership in the source system. */
export function openRewardDisplay(
    player: PlayerState,
    services: ScriptServices,
    title: string,
    rewards: readonly VisualReward[],
    options: RewardDisplayOptions = {},
): void {
    claims.delete(player);
    if(options.claim)claims.set(player,options.claim);
    openUiPanel(services, player, REWARD_DISPLAY_PANEL_GROUP_ID, title);
    for (const [id,source] of [[850,"barrows"],[856,"theatre"],[857,"lunar"]] as const)
        services.dialog.queueWidgetEvent(player.id,{action:"set_hidden",uid:packUid(REWARD_DISPLAY_PANEL_GROUP_ID,id),
            hidden:source !== (options.source ?? "barrows")});
    for(const id of [846,848,849,852,853,854,855,858,859])services.dialog.queueWidgetEvent(player.id,{action:"set_hidden",
        uid:packUid(REWARD_DISPLAY_PANEL_GROUP_ID,id),hidden:!options.claim});
    for (let slot = 0; slot < REWARD_DISPLAY_CAPACITY; slot += 1) {
        const reward = rewards[slot];
        services.dialog.queueWidgetEvent(player.id, {
            action: "set_item",
            uid: packUid(REWARD_DISPLAY_PANEL_GROUP_ID, REWARD_DISPLAY_SLOT_BASE + slot * 2 + 1),
            itemId: reward?.itemId ?? -1,
            quantity: reward?.quantity ?? 0,
        });
    }
}
