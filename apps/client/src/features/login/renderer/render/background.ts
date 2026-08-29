import type { LoginRendererHost, RenderContext } from "@client/features/login/renderer/host";
import { getTitleBackgroundLayout } from "@client/features/login/renderer/layout/geometry";

export function drawTitleBackgroundToCtx(host: LoginRendererHost, ctx: RenderContext) {

        if (!host.titleBackgroundImage) return;

        const bg = getTitleBackgroundLayout(host);
        ctx.drawImage(
            host.titleBackgroundImage,
            bg.drawX,
            bg.drawY,
            bg.drawW,
            bg.drawH,
        );
    
}
