import {getSpellData} from "@server/game/spells/SpellDataProvider";
import type {CombatPlayerHitActionData} from "@server/game/actions/actionPayloads";
import type {CombatActionServices} from "@server/game/actions/handlers/CombatActionHandler";

export function isTwinflameSpell(weaponId: number | undefined, spellId: unknown): boolean {
    const spell=typeof spellId==="number"?getSpellData(spellId):undefined;
    return weaponId===30634 && !!spell && /^(Wind|Water|Earth|Fire) (Bolt|Blast|Wave)$/i.test(spell.name??"");
}
export function queueTwinflameActionEcho(services: CombatActionServices, playerId: number,
    data: CombatPlayerHitActionData, amount: number, hp: number, tick: number): void {
    if(!data.twinflameEchoPending || data.twinflameEcho || amount<=0 || hp<=0)return;
    const damage=Math.floor(amount*0.4);
    services.scheduleAction(playerId,{kind:"combat.playerHit",groups:["combat.hit"],delayTicks:1,cooldownTicks:0,
        data:{...data,hit:undefined,damage,maxHit:damage,expectedHitTick:tick+1,hitDelay:1,clientDelayTicks:0,
            twinflameEchoPending:false,twinflameEcho:true,xpGrantedOnAttack:true,magicImpactEffectsScheduled:false}},tick);
}
