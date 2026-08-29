import { SceneLoc } from "@august/osrs-engine/scene/SceneLoc";
import { Entity } from "@august/osrs-engine/scene/entity/Entity";
import { EntityTag } from "@august/osrs-engine/scene/entity/EntityTag";

export class WallDecoration implements SceneLoc {
    constructor(
        readonly tag: EntityTag,
        readonly flags: number,
        readonly x: number,
        readonly y: number,
        readonly height: number,
        readonly entity0: Entity,
        readonly entity1: Entity | undefined,
        public offsetX: number,
        public offsetY: number,
    ) {}
}
