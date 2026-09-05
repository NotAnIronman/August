import { useState } from "react";
import type { OsrsClient } from "@client/engine/game/OsrsClient";

export function DevelopmentSettings({ client }: { client: OsrsClient }): JSX.Element {
    const [, refresh] = useState(0);
    return <section className="rl-sidebar-settings-group" aria-label="Development">
        <h3>Development</h3>
        <label className="rl-sidebar-check">
            <input type="checkbox" checked={client.debugId} onChange={event => {
                client.debugId = event.target.checked;
                client.closeMenu();
                refresh(value => value + 1);
            }} />
            <span>Show object, NPC and item IDs</span>
        </label>
        <p className="rl-sidebar-panel-copy">
            Right-click and read the ID beside Examine. Also shows unnamed objects for debugging.
            Saved on this browser; reopen the game menu after changing this setting.
        </p>
    </section>;
}
