import { SceneLoc } from "@august/osrs-engine/scene/SceneLoc";
import { LocEntity } from "@august/osrs-engine/scene/entity/LocEntity";
import { ModelInfo } from "@client/engine/rendering/buffer/SceneBuffer";

export type SceneLocEntity = {
    entity: LocEntity;
    sceneLoc: SceneLoc;
    lowDetail: boolean;
} & ModelInfo;
