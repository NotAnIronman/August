import { ProgramSource, prependDefines } from "@client/engine/rendering/shaders/ShaderUtil";
import frameFxaaFragShader from "@client/engine/rendering/shaders/frame-fxaa.frag.glsl";
import frameFxaaVertShader from "@client/engine/rendering/shaders/frame-fxaa.vert.glsl";
import frameFragShader from "@client/engine/rendering/shaders/frame.frag.glsl";
import frameVertShader from "@client/engine/rendering/shaders/frame.vert.glsl";
import mainFragShader from "@client/engine/rendering/shaders/main.frag.glsl";
import mainVertShader from "@client/engine/rendering/shaders/main.vert.glsl";
import npcVertShader from "@client/engine/rendering/shaders/npc.vert.glsl";
import playerFragShader from "@client/engine/rendering/shaders/player.frag.glsl";
import playerVertShader from "@client/engine/rendering/shaders/player.vert.glsl";
import projectileVertShader from "@client/engine/rendering/shaders/projectile.vert.glsl";

export function createProgram(
    vertShader: string,
    fragShader: string,
    discardAlpha: boolean,
    multiDraw: boolean,
): ProgramSource {
    const defines: string[] = [];
    if (multiDraw) {
        defines.push("MULTI_DRAW");
    }
    if (discardAlpha) {
        defines.push("DISCARD_ALPHA");
    }
    return [prependDefines(vertShader, defines), prependDefines(fragShader, defines)];
}

export function createMainProgram(discardAlpha: boolean, multiDraw: boolean): ProgramSource {
    return createProgram(mainVertShader, mainFragShader, discardAlpha, multiDraw);
}

export function createNpcProgram(discardAlpha: boolean, multiDraw: boolean): ProgramSource {
    return createProgram(npcVertShader, mainFragShader, discardAlpha, multiDraw);
}

export function createProjectileProgram(discardAlpha: boolean, multiDraw: boolean): ProgramSource {
    return createProgram(projectileVertShader, mainFragShader, discardAlpha, multiDraw);
}

export function createPlayerProgram(discardAlpha: boolean, multiDraw: boolean): ProgramSource {
    return createProgram(playerVertShader, playerFragShader, discardAlpha, multiDraw);
}

export const FRAME_PROGRAM = [frameVertShader, frameFragShader];
export const FRAME_FXAA_PROGRAM = [frameFxaaVertShader, frameFxaaFragShader];
