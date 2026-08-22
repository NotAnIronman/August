import { GLRenderer } from "../renderer";
import { TextureCache } from "../texture-cache";
import type { GLRenderOpts } from "./glRenderOpts";
import { SCROLLBAR_BOTTOM_COLOR, SCROLLBAR_THUMB_COLOR, SCROLLBAR_TOP_COLOR, SCROLLBAR_TRACK_COLOR } from "./constants";
import { scaleLogicalPixels } from "./scaleLogicalPixels";
export function drawScrollBar(
    glr: GLRenderer,
    x: number,
    y: number,
    scrollY: number,
    height: number,
    scrollHeight: number,
    tc: TextureCache,
    opts: GLRenderOpts,
    scaleX: number = 1,
    scaleY: number = 1,
): void {
    x = x | 0;
    y = y | 0;
    height = height | 0;
    scrollHeight = scrollHeight | 0;
    scrollY = scrollY | 0;

    // Scrollbar dimensions
    const SCROLLBAR_WIDTH = scaleLogicalPixels(scaleX, 16);
    const ARROW_HEIGHT = scaleLogicalPixels(scaleY, 16);
    const EDGE_WIDTH = Math.min(SCROLLBAR_WIDTH, scaleLogicalPixels(scaleX, 1));
    const EDGE_HEIGHT = Math.min(Math.max(1, height), scaleLogicalPixels(scaleY, 1));

    const scrollbarSpriteArchiveId = opts.widgetManager?.scrollbarSpriteArchiveId ?? -1;
    // These named assets are the cache's current native scrollbar arrows. The
    // GraphicsDefaults archive is retained as a version-safe fallback for
    // caches that predate scrollbar_v2.
    const upArrow =
        tc.getByNameToken("scrollbar_v2,0") ??
        (scrollbarSpriteArchiveId >= 0
            ? tc.getSpriteByArchiveFrame(scrollbarSpriteArchiveId, 0)
            : undefined);
    const downArrow =
        tc.getByNameToken("scrollbar_v2,1") ??
        (scrollbarSpriteArchiveId >= 0
            ? tc.getSpriteByArchiveFrame(scrollbarSpriteArchiveId, 1)
            : undefined);

    // Draw up arrow
    if (upArrow) {
        glr.drawTexture(upArrow, x, y, SCROLLBAR_WIDTH, ARROW_HEIGHT, 1, 1);
    }

    // Draw down arrow
    if (downArrow) {
        glr.drawTexture(
            downArrow,
            x,
            y + height - ARROW_HEIGHT,
            SCROLLBAR_WIDTH,
            ARROW_HEIGHT,
            1,
            1,
        );
    }

    // Draw track (area between arrows). scrollbar_dragger_v2 is the native
    // cache set used by the game's CS2 scrollbar builder.
    const trackHeight = height - ARROW_HEIGHT * 2;
    if (trackHeight > 0) {
        const nativeTrack = tc.getByNameToken("scrollbar_dragger_v2,3");
        if (nativeTrack) {
            glr.drawTexture(nativeTrack, x, y + ARROW_HEIGHT, SCROLLBAR_WIDTH, trackHeight, 1, 1);
        } else {
            const tr = ((SCROLLBAR_TRACK_COLOR >>> 16) & 0xff) / 255;
            const tg = ((SCROLLBAR_TRACK_COLOR >>> 8) & 0xff) / 255;
            const tb = (SCROLLBAR_TRACK_COLOR & 0xff) / 255;
            glr.drawRect(x, y + ARROW_HEIGHT, SCROLLBAR_WIDTH, trackHeight, [tr, tg, tb, 1]);
        }
    }

    // Calculate thumb size and position
    // Reference: UserComparator9.drawScrollBar lines 569-574
    // var5 = height * (height - 32) / scrollHeight (thumb height)
    // var6 = (height - 32 - var5) * scrollY / (scrollHeight - height) (thumb position)
    const availableTrack = trackHeight;
    let thumbHeight = Math.floor((height * availableTrack) / scrollHeight);
    const minThumbHeight = scaleLogicalPixels(scaleY, 8);
    if (thumbHeight < minThumbHeight) thumbHeight = minThumbHeight;

    const maxScrollY = scrollHeight - height;
    const thumbY =
        maxScrollY > 0 ? Math.floor(((availableTrack - thumbHeight) * scrollY) / maxScrollY) : 0;

    // Draw thumb. The native cache scrollbar has separate top, centre and
    // bottom slices. Compose them only when all three are available; retaining
    // the geometric fallback makes this work against older/partial caches too.
    if (thumbHeight > 0 && thumbHeight < trackHeight) {
        const nativeThumbTop = tc.getByNameToken("scrollbar_dragger_v2,0");
        const nativeThumbCentre = tc.getByNameToken("scrollbar_dragger_v2,1");
        const nativeThumbBottom = tc.getByNameToken("scrollbar_dragger_v2,2");
        const thumbTop = y + ARROW_HEIGHT + thumbY;
        if (nativeThumbTop && nativeThumbCentre && nativeThumbBottom) {
            const desiredTop = Math.max(1, Math.round(nativeThumbTop.h * scaleY));
            const desiredBottom = Math.max(1, Math.round(nativeThumbBottom.h * scaleY));
            const topHeight = Math.min(desiredTop, Math.max(1, Math.floor(thumbHeight / 2)));
            const bottomHeight = Math.min(
                desiredBottom,
                Math.max(1, thumbHeight - topHeight - 1),
            );
            const centreHeight = Math.max(1, thumbHeight - topHeight - bottomHeight);
            glr.drawTexture(nativeThumbTop, x, thumbTop, SCROLLBAR_WIDTH, topHeight, 1, 1);
            glr.drawTexture(
                nativeThumbCentre,
                x,
                thumbTop + topHeight,
                SCROLLBAR_WIDTH,
                centreHeight,
                1,
                1,
            );
            glr.drawTexture(
                nativeThumbBottom,
                x,
                thumbTop + topHeight + centreHeight,
                SCROLLBAR_WIDTH,
                bottomHeight,
                1,
                1,
            );
            return;
        }

        const tr = ((SCROLLBAR_THUMB_COLOR >>> 16) & 0xff) / 255;
        const tg = ((SCROLLBAR_THUMB_COLOR >>> 8) & 0xff) / 255;
        const tb = (SCROLLBAR_THUMB_COLOR & 0xff) / 255;
        glr.drawRect(x, thumbTop, SCROLLBAR_WIDTH, thumbHeight, [tr, tg, tb, 1]);

        // Draw thumb highlight (left and top edges)
        const hr = ((SCROLLBAR_TOP_COLOR >>> 16) & 0xff) / 255;
        const hg = ((SCROLLBAR_TOP_COLOR >>> 8) & 0xff) / 255;
        const hb = (SCROLLBAR_TOP_COLOR & 0xff) / 255;
        const leftEdgeW = Math.min(SCROLLBAR_WIDTH, EDGE_WIDTH);
        const leftInsetW = Math.min(Math.max(0, SCROLLBAR_WIDTH - leftEdgeW), EDGE_WIDTH);
        const topEdgeH = Math.min(thumbHeight, EDGE_HEIGHT);
        const topInsetH = Math.min(Math.max(0, thumbHeight - topEdgeH), EDGE_HEIGHT);
        if (leftEdgeW > 0) {
            glr.drawRect(x, thumbTop, leftEdgeW, thumbHeight, [hr, hg, hb, 1]);
        }
        if (leftInsetW > 0) {
            glr.drawRect(x + leftEdgeW, thumbTop, leftInsetW, thumbHeight, [hr, hg, hb, 1]);
        }
        if (topEdgeH > 0) {
            glr.drawRect(x, thumbTop, SCROLLBAR_WIDTH, topEdgeH, [hr, hg, hb, 1]);
        }
        if (topInsetH > 0) {
            glr.drawRect(x, thumbTop + topEdgeH, SCROLLBAR_WIDTH, topInsetH, [hr, hg, hb, 1]);
        }

        // Draw thumb shadow (right and bottom edges)
        const sr = ((SCROLLBAR_BOTTOM_COLOR >>> 16) & 0xff) / 255;
        const sg = ((SCROLLBAR_BOTTOM_COLOR >>> 8) & 0xff) / 255;
        const sb = (SCROLLBAR_BOTTOM_COLOR & 0xff) / 255;
        const rightEdgeW = Math.min(SCROLLBAR_WIDTH, EDGE_WIDTH);
        const rightInsetW = Math.min(Math.max(0, SCROLLBAR_WIDTH - rightEdgeW), EDGE_WIDTH);
        const bottomEdgeH = Math.min(thumbHeight, EDGE_HEIGHT);
        const bottomInsetH = Math.min(Math.max(0, thumbHeight - bottomEdgeH), EDGE_HEIGHT);
        if (rightEdgeW > 0) {
            glr.drawRect(x + SCROLLBAR_WIDTH - rightEdgeW, thumbTop, rightEdgeW, thumbHeight, [
                sr,
                sg,
                sb,
                1,
            ]);
        }
        if (rightInsetW > 0 && thumbHeight > topEdgeH) {
            glr.drawRect(
                x + SCROLLBAR_WIDTH - rightEdgeW - rightInsetW,
                thumbTop + topEdgeH,
                rightInsetW,
                thumbHeight - topEdgeH,
                [sr, sg, sb, 1],
            );
        }
        if (bottomEdgeH > 0) {
            glr.drawRect(x, thumbTop + thumbHeight - bottomEdgeH, SCROLLBAR_WIDTH, bottomEdgeH, [
                sr,
                sg,
                sb,
                1,
            ]);
        }
        if (bottomInsetH > 0 && SCROLLBAR_WIDTH > leftEdgeW) {
            glr.drawRect(
                x + leftEdgeW,
                thumbTop + thumbHeight - bottomEdgeH - bottomInsetH,
                SCROLLBAR_WIDTH - leftEdgeW,
                bottomInsetH,
                [sr, sg, sb, 1],
            );
        }
    }
}

// Item icons come from injected 3D renderer via opts.itemIconCanvas only.
