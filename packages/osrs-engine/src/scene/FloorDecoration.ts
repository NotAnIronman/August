import { SceneLoc } from "@august/osrs-engine/scene/SceneLoc";
import { Entity } from "@august/osrs-engine/scene/entity/Entity";
import { EntityTag } from "@august/osrs-engine/scene/entity/EntityTag";

export class FloorDecoration implements SceneLoc {
    constructor(
        public entity: Entity,
        readonly x: number,
        readonly y: number,
        readonly height: number,
        readonly tag: EntityTag,
        readonly flags: number,
    ) {}
}
