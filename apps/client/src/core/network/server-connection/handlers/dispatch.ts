import { ClientState } from "@client/engine/game/ClientState";
import {
    VARP_AREA_SOUNDS_VOLUME,
    VARP_COMBAT_TARGET_PLAYER_INDEX,
    VARP_FOLLOWER_INDEX,
    VARP_MASTER_VOLUME,
    VARP_MUSIC_VOLUME,
    VARP_OPTION_ATTACK_PRIORITY_NPC,
    VARP_OPTION_ATTACK_PRIORITY_PLAYER,
    VARP_SOUND_EFFECTS_VOLUME,
} from "@august/game-model/state/vars";
import { send } from "@client/core/network/server-connection/connection/send";
import { emitCollectionLog, emitInventory } from "@client/core/network/server-connection/domain/inventory";
import { handleShopPayload } from "@client/core/network/server-connection/domain/shop";
import { handleSmithingPayload } from "@client/core/network/server-connection/domain/smithing";
import { emitPlayerSync, emitSkills } from "@client/core/network/server-connection/domain/skills";
import { handleTradePayload } from "@client/core/network/server-connection/domain/trade";
import { getClientCycle } from "@client/core/network/server-connection/timing";
import { cloneRunEnergyState, state } from "@client/core/network/server-connection/state";
import {
    BANK_SLOT_COUNT_FALLBACK,
    DEFAULT_SERVER_TICK_MS,
    RUN_ENERGY_MAX_UNITS,
} from "@client/core/network/server-connection/constants";
import type {
    BankServerUpdate,
    ChatMessageEvent,
    GroundItemsServerPayload,
    NotificationEvent,
    RunEnergyPayload,
    RunEnergyState,
    ShopServerPayload,
    SmithingServerPayload,
    SkillsServerPayload,
    SpotAnimationPayload,
    TradeServerPayload,
} from "@client/core/network/server-connection/types/index";
import type { WidgetServerPayload } from "@client/core/network/server-connection/types/widgets";
import { decodeBase64 } from "@client/core/network/server-connection/encoding/Base64";
import { applyGroundItemsDelta, cloneGroundItemsPayload } from "@client/core/network/server-connection/domain/groundItems";
import { sanitizeBankSlotMessage, sanitizeInventorySlotMessage, sanitizeSpellResult } from "@client/core/network/server-connection/normalization/InboundPayloads";

import { handleAuthTickMessage } from "@client/core/network/server-connection/handlers/authTick";
import { handleInboundSync } from "@client/core/network/server-connection/handlers/inboundSync";
import { handleInboundUi } from "@client/core/network/server-connection/handlers/inboundUi";
import { handleInboundWorld } from "@client/core/network/server-connection/handlers/inboundWorld";

export function processServerMessage(msg: any): void {
    if (handleAuthTickMessage(msg)) return;
    if (handleInboundSync(msg)) return;
    if (handleInboundUi(msg)) return;
    handleInboundWorld(msg);
}
