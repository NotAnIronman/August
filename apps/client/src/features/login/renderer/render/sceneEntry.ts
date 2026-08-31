import type { LoginState } from "@client/features/login/LoginState";
import type { LoginRendererHost } from "@client/features/login/renderer/host";
import { withRenderTransform } from "@client/features/login/renderer/layout/config";
import { updateLayout } from "@client/features/login/renderer/layout/updateLayout";
import { getCanvas, getContext } from "@client/features/login/renderer/canvas";
import { drawTitleBackgroundToCtx } from "@client/features/login/renderer/render/background";
import { drawLoadingBarToCtx, drawDownloadBarToCtx } from "@client/features/login/renderer/render/loadingBars";
import { drawLogoToCtx } from "@client/features/login/renderer/render/drawUtils";
import { drawTitleMuteButton } from "@client/features/login/renderer/controls";

export function drawDownload(host: LoginRendererHost, state: LoginState, width: number, height: number, layoutWidth = width, layoutHeight = height) {

        const canvas = getCanvas(host, width, height);
        const ctx = getContext(host);
        if (!ctx) return;

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);

        updateLayout(host, layoutWidth, layoutHeight, width, height);

        withRenderTransform(host, ctx, () => {
            // Draw title background if available (may not be during early download)
            drawTitleBackgroundToCtx(host, ctx);
            drawLogoToCtx(host, ctx);

            // Draw download progress bar
            drawDownloadBarToCtx(host, ctx, state);
        });
    
}

export function drawInitial(host: LoginRendererHost, state: LoginState, width: number, height: number, layoutWidth = width, layoutHeight = height) {

        const canvas = getCanvas(host, width, height);
        const ctx = getContext(host);
        if (!ctx) return;

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);

        updateLayout(host, layoutWidth, layoutHeight, width, height);

        withRenderTransform(host, ctx, () => {
            // Draw title background
            drawTitleBackgroundToCtx(host, ctx);
            drawLogoToCtx(host, ctx);

            // Draw loading bar
            drawLoadingBarToCtx(host, ctx, state);

            // OSRS title loading state shows the music toggle before the welcome buttons appear.
            drawTitleMuteButton(host, ctx, state.titleMusicDisabled);
        });
    
}
