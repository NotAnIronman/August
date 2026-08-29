import { PathService } from "@server/pathfinding/PathService";

type PathServiceOverrides = Partial<
    Pick<
        PathService,
        "edgeHasWallBetween" | "findNpcPathStep" | "findPathSteps" | "projectileRaycast"
    >
>;

/**
 * A typed PathService shell for focused combat tests. Tests must explicitly
 * provide every pathfinding operation their scenario reaches.
 */
export function createTestPathService(overrides: PathServiceOverrides = {}): PathService {
    return Object.assign(Object.create(PathService.prototype) as PathService, overrides);
}
