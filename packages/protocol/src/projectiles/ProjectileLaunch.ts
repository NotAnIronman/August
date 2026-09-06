export type ProjectileActorRef =
    | {
          kind: "player";
          serverId: number;
      }
    | {
          kind: "npc";
          serverId: number;
      };

export interface ProjectileEndpoint {
    tileX: number;
    tileY: number;
    plane: number;
    actor?: ProjectileActorRef;
}

export interface ProjectileLaunch {
    /** Server-side audience scope; deliberately not encoded as a client endpoint. */
    worldViewId?: number;
    projectileId: number;
    source: ProjectileEndpoint;
    target: ProjectileEndpoint;
    sourceHeight: number;
    endHeight: number;
    slope: number;
    startPos: number;
    startCycleOffset: number;
    endCycleOffset: number;
}
