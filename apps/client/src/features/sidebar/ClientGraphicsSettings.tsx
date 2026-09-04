import { useState } from "react";
import type { OsrsClient } from "@client/engine/game/OsrsClient";

/** Player-facing controls live in the sidebar, never a floating developer overlay. */
export function ClientGraphicsSettings({ client }: { client: OsrsClient }): JSX.Element {
    const [, refresh] = useState(0);
    const change = (callback: () => void) => { callback(); refresh(value => value + 1); };
    return <section style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Client graphics settings">
        <h3>Client graphics</h3>
        <label className="rl-sidebar-field">Draw distance: {client.renderDistance}
            <input aria-label="Draw distance" type="range" min={25} max={90} step={1} value={client.renderDistance}
                onChange={event => change(() => { client.renderDistance = Number(event.target.value); client.lodDistance = Math.max(0, client.renderDistance - 2); })} />
        </label>
        <label className="rl-sidebar-field">Frame limit
            <select aria-label="Frame limit" value={client.targetFps} onChange={event => change(() => client.setTargetFps(Number(event.target.value)))}>
                {[0,60,90,120,144,165,240].map(value => <option key={value} value={value}>{value || "Uncapped"}</option>)}
            </select>
        </label>
        <label className="rl-sidebar-field">Camera speed: {client.cameraSpeed.toFixed(1)}
            <input aria-label="Camera speed" type="range" min={0.1} max={5} step={0.1} value={client.cameraSpeed}
                onChange={event => change(() => { client.cameraSpeed = Number(event.target.value); })} />
        </label>
        <label className="rl-sidebar-check">Performance statistics
            <input type="checkbox" checked={client.hoverOverlayEnabled} onChange={event => change(() => { client.hoverOverlayEnabled = event.target.checked; })} />
        </label>
        <label className="rl-sidebar-check">Debug IDs and unnamed objects
            <input type="checkbox" checked={client.debugId} onChange={event => change(() => { client.debugId = event.target.checked; })} />
        </label>
        <p className="rl-sidebar-plugin-desc">Keybindings, layout, and audio are in the game's Settings tab.</p>
    </section>;
}
