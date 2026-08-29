import { SceneLoc } from "@august/osrs-engine/scene/SceneLoc";
import { Entity } from "@august/osrs-engine/scene/entity/Entity";
import { EntityTag } from "@august/osrs-engine/scene/entity/EntityTag";

export class Loc implements SceneLoc {
    constructor(
        readonly tag: EntityTag,
        readonly flags: number,
        public level: number,
        readonly x: number,
        readonly y: number,
        readonly height: number,
        public entity: Entity,
        readonly rotation: number,
        readonly startX: number,
        readonly startY: number,
        readonly endX: number,
        readonly endY: number,
    ) {}
}
