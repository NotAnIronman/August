/**
 * Game State Management Module
 *
 * Provides centralized state management for the game client:
 * - GameStateMachine: Single source of truth for game state with atomic transitions
 * - LoadingTracker: Event-driven loading requirement tracking
 */

export { GameStateMachine } from "@client/engine/game/state/GameStateMachine";
export type { StateTransition, StateListener } from "@client/engine/game/state/GameStateMachine";
export { LoadingTracker, LoadingRequirement } from "@client/engine/game/state/LoadingTracker";
export type { LoadingProgress, LoadingProgressListener } from "@client/engine/game/state/LoadingTracker";
