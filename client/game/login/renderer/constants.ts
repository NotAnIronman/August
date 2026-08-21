import { getServerListUrl } from "../../../config/clientEnv";
import type { ServerListEntry, World } from "./types";

export const MOCK_WORLDS: World[] = [];

export const FALLBACK_SERVERS: ServerListEntry[] = [
    {
        id: 1,
        name: "World 1",
        address: "localhost:43594",
        secure: false,
        playerCount: null,
        maxPlayers: 1234,
        location: 0,
        activity: "Vanilla",
        properties: 0,
    },
    {
        id: 2,
        name: "World 2",
        address: "localhost:43595",
        secure: false,
        playerCount: null,
        maxPlayers: 1234,
        location: 0,
        activity: "Leagues V",
        properties: 0,
    },
];

export const SERVER_LIST_URL = getServerListUrl();

export const LOGIN_LAYOUT = {
    LOGIN_BOX_X: 202,
    LOGIN_BOX_CENTER: 382,
    TITLEBOX_Y: 170,
    TITLEBOX_FALLBACK_WIDTH: 360,
    TITLEBOX_FALLBACK_HEIGHT: 200,
    BOTTOM_CONTROLS_RESERVE: 52,
    CONTENT_WIDTH: 765,
    SCENE_WIDTH: 765,
    SCENE_HEIGHT: 503,
    TITLE_BG_WIDTH: 1089,
    TITLE_BG_CROP_X: Math.floor((1089 - 765) / 2),
    MAX_BG_WIDTH: 765,
    MAX_BG_HEIGHT: 503,
    CARET_BLINK_INTERVAL_MS: 500,
} as const;
