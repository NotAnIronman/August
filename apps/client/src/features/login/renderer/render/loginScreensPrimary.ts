import { GameState } from "@client/features/login/GameState";
import type { LoginState } from "@client/features/login/LoginState";
import type { LoginRendererHost, RenderContext } from "@client/features/login/renderer/host";
import { getWelcomeLayout } from "@client/features/login/renderer/layout/geometry";
import { isCaretVisible } from "@client/features/login/renderer/canvas";
import { drawButton, drawCenteredText, drawGradientRect, drawText, drawSprite, ellipsis, measureText, getCheckboxSprite, truncateFromStart } from "@client/features/login/renderer/render/drawUtils";

const SAVED_ACCOUNTS_X_OFFSET = 370;
const SAVED_ACCOUNTS_Y = 216;
const SAVED_ACCOUNTS_WIDTH = 172;
const SAVED_ACCOUNTS_ROW_Y = 236;
const SAVED_ACCOUNTS_ROW_HEIGHT = 21;
/** Small "x" hit-zone on the right edge of each row, used to forget that slot. */
const SAVED_ACCOUNTS_REMOVE_BUTTON_WIDTH = 16;

export function getSavedAccountSlotBounds(host: LoginRendererHost, slot: number) {
    return {
        x: host.loginBoxX + SAVED_ACCOUNTS_X_OFFSET,
        y: SAVED_ACCOUNTS_ROW_Y + slot * SAVED_ACCOUNTS_ROW_HEIGHT,
        width: SAVED_ACCOUNTS_WIDTH,
        height: SAVED_ACCOUNTS_ROW_HEIGHT - 1,
    };
}

/** Bounds of the small "x" remove button at the right edge of a saved-account row. */
export function getSavedAccountRemoveButtonBounds(host: LoginRendererHost, slot: number) {
    const row = getSavedAccountSlotBounds(host, slot);
    return {
        x: row.x + row.width - SAVED_ACCOUNTS_REMOVE_BUTTON_WIDTH,
        y: row.y,
        width: SAVED_ACCOUNTS_REMOVE_BUTTON_WIDTH,
        height: row.height,
    };
}

function drawSavedAccounts(host: LoginRendererHost, ctx: RenderContext, state: LoginState): void {
    const panelX = host.loginBoxX + SAVED_ACCOUNTS_X_OFFSET;
    drawGradientRect(host, ctx, panelX, SAVED_ACCOUNTS_Y, SAVED_ACCOUNTS_WIDTH, SAVED_ACCOUNTS_ROW_HEIGHT * 4 + 18, 0x3a3022, 0x17120c);
    drawCenteredText(host, ctx, host.fontBold12!, "Saved accounts", panelX + 86, 230, 0xffff00, true);
    for (let slot = 0; slot < 4; slot++) {
        const bounds = getSavedAccountSlotBounds(host, slot);
        const account = state.savedAccountSlots[slot];
        const occupied = !!account?.username;
        drawGradientRect(host, ctx, bounds.x + 1, bounds.y, bounds.width - 2, bounds.height, occupied ? 0x4c4131 : 0x282017, occupied ? 0x2e271d : 0x17120c);
        // Leave room on the right for the remove "x" so the truncated name never sits under it.
        const labelMaxWidth = occupied ? bounds.width - 12 - SAVED_ACCOUNTS_REMOVE_BUTTON_WIDTH : bounds.width - 12;
        const label = occupied
            ? `${slot + 1}. ${ellipsis(host, account.username, labelMaxWidth)}`
            : `${slot + 1}. Empty`;
        drawText(host, ctx, host.fontBold12!, label, bounds.x + 6, bounds.y + 14, occupied ? 0xffffff : 0x9c9588, true);
        if (occupied) {
            const removeBounds = getSavedAccountRemoveButtonBounds(host, slot);
            drawCenteredText(
                host, ctx, host.fontBold12!, "x",
                removeBounds.x + removeBounds.width / 2, bounds.y + 14, 0xff9090, true,
            );
        }
    }
}

export function drawWelcomeScreen(host: LoginRendererHost, ctx: RenderContext, state: LoginState) {

        if (!host.fontBold12) return;
        const layout = getWelcomeLayout(host);
        const welcomeName = state.serverName?.trim() || "xRSPS";
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            `Welcome to ${welcomeName}`,
            layout.centerX,
            layout.titleY,
            0xffff00,
            true,
        );
        drawButton(host, 
            ctx,
            layout.centerX - layout.buttonSpacing,
            layout.buttonY,
            "New User",
        );
        drawButton(host, 
            ctx,
            layout.centerX + layout.buttonSpacing,
            layout.buttonY,
            "Existing User",
        );
    
}

export function drawWarningScreen(host: LoginRendererHost, ctx: RenderContext, state: LoginState) {

        if (!host.fontBold12) return;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response0,
            host.loginBoxX + 180,
            201,
            0xffff00,
            true,
        );
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response1,
            host.loginBoxX + 180,
            236,
            0xffffff,
            true,
        );
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response2,
            host.loginBoxX + 180,
            251,
            0xffffff,
            true,
        );
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response3,
            host.loginBoxX + 180,
            266,
            0xffffff,
            true,
        );
        drawButton(host, ctx, host.loginBoxCenter - 80, 321, "Continue");
        drawButton(host, ctx, host.loginBoxCenter + 80, 321, "Cancel");
    
}

export function drawLoginForm(host: LoginRendererHost, ctx: RenderContext, state: LoginState, gameState: GameState) {

        if (!host.fontBold12) return;

        const isConnecting = gameState === GameState.CONNECTING;

        // Response messages at top
        let textY = 201;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response0,
            host.loginBoxX + 180,
            textY,
            0xffff00,
            true,
        );
        textY += 15;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response1,
            host.loginBoxX + 180,
            textY,
            0xffff00,
            true,
        );
        textY += 15;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response2,
            host.loginBoxX + 180,
            textY,
            0xffff00,
            true,
        );
        textY += 10; // OSRS uses 10px gap before input fields

        // Username field
        const cursor = isCaretVisible(host) ? "|" : "";
        const displayUsername = state.isUsernameHidden
            ? "*".repeat(state.username.length)
            : state.username;
        const usernameCursor = state.currentLoginField === 0 ? cursor : "";
        drawText(host, 
            ctx,
            host.fontBold12,
            "Username: " + truncateFromStart(host, displayUsername, 195) + usernameCursor,
            host.loginBoxX + 180 - 108,
            textY,
            0xffffff,
            true,
        );
        textY += 15;

        // Password field
        const passwordCursor = state.currentLoginField === 1 ? cursor : "";
        drawText(host, 
            ctx,
            host.fontBold12,
            "Password: " + state.getMaskedPassword() + passwordCursor,
            host.loginBoxX + 180 - 108,
            textY,
            0xffffff,
            true,
        );
        textY += 30;

        // Checkboxes (only show when not connecting)
        if (!isConnecting) {
            const checkboxX = host.loginBoxX + 180 - 108;
            const rememberSprite = getCheckboxSprite(host, 
                state.rememberUsername,
                state.rememberUsernameHover,
            );
            if (rememberSprite) {
                drawText(host, 
                    ctx,
                    host.fontBold12,
                    "Remember username: ",
                    checkboxX,
                    textY,
                    0xffff00,
                    true,
                );
                const textWidth = measureText(host, host.fontBold12, "Remember username: ");
                drawSprite(host, 
                    ctx,
                    rememberSprite,
                    checkboxX + textWidth,
                    textY - host.fontBold12.lineHeight,
                );
            }
        }

        // Buttons (hide when connecting)
        if (!isConnecting) {
            drawButton(host, ctx, host.loginBoxCenter - 80, 301, "Login");
            drawButton(host, ctx, host.loginBoxCenter + 80, 301, "Cancel");
            drawSavedAccounts(host, ctx, state);
        }

        // Help link (only show when not connecting)
        if (!isConnecting && host.fontPlain11) {
            const helpText =
                state.loginFieldType === 1
                    ? "Can't login? Click here."
                    : "Having trouble logging in?";
            drawCenteredText(host, 
                ctx,
                host.fontPlain11,
                helpText,
                host.loginBoxX + 180,
                357,
                0xffffff,
                true,
            );
        }
    
}

export function drawInvalidCredentials(host: LoginRendererHost, ctx: RenderContext, state: LoginState) {

        if (!host.fontBold12) return;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response0,
            host.loginBoxX + 180,
            201,
            0xffff00,
            true,
        );
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response1,
            host.loginBoxX + 180,
            221,
            0xffff00,
            true,
        );
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response2,
            host.loginBoxX + 180,
            241,
            0xffff00,
            true,
        );
        drawButton(host, ctx, host.loginBoxX + 180, 276, "Try again");
        drawButton(host, ctx, host.loginBoxX + 180, 326, "Forgotten password?");
    
}

export function drawAuthenticator(host: LoginRendererHost, ctx: RenderContext, state: LoginState) {

        if (!host.fontBold12) return;

        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            "Authenticator",
            host.loginBoxX + 180,
            201,
            0xffff00,
            true,
        );

        let textY = 236;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response1,
            host.loginBoxX + 180,
            textY,
            0xffffff,
            true,
        );
        textY += 15;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response2,
            host.loginBoxX + 180,
            textY,
            0xffffff,
            true,
        );
        textY += 15;
        drawCenteredText(host, 
            ctx,
            host.fontBold12,
            state.response3,
            host.loginBoxX + 180,
            textY,
            0xffffff,
            true,
        );
        textY += 15;

        // PIN field
        const cursor = isCaretVisible(host) ? "|" : "";
        drawText(host, 
            ctx,
            host.fontBold12,
            "PIN: " + state.getMaskedOtp() + cursor,
            host.loginBoxX + 180 - 108,
            textY,
            0xffffff,
            true,
        );

        // Trust checkbox
        textY -= 8;
        drawText(host, 
            ctx,
            host.fontBold12,
            "Trust this computer",
            host.loginBoxX + 180 - 9,
            textY,
            0xffff00,
            true,
        );
        textY += 15;
        drawText(host, 
            ctx,
            host.fontBold12,
            "for 30 days: ",
            host.loginBoxX + 180 - 9,
            textY,
            0xffff00,
            true,
        );

        const trustTextWidth = measureText(host, host.fontBold12, "for 30 days: ");
        const checkboxX = host.loginBoxX + 180 - 9 + trustTextWidth + 15;
        const checkboxY = textY - host.fontBold12.lineHeight;
        const trustSprite = state.trustComputer
            ? host.optionsRadioSprite2
            : host.optionsRadioSprite0;
        if (trustSprite) {
            drawSprite(host, ctx, trustSprite, checkboxX, checkboxY);
        }

        drawButton(host, ctx, host.loginBoxX + 180 - 80, 321, "Continue");
        drawButton(host, ctx, host.loginBoxX + 180 + 80, 321, "Cancel");
    
}
