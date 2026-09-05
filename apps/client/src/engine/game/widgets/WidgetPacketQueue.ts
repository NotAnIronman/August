import type { WidgetServerPayload } from "@client/core/network/server-connection/types/widgets";
import type { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import type { WidgetManager } from "@client/ui/widgets/WidgetManager";

/** Preserve packet order while JS5 supplies widgets and their complete scripts. */
export class WidgetPacketQueue {
    private pending: WidgetServerPayload[] = [];
    constructor(private readonly widgets: () => WidgetManager,
        private readonly scripts: () => ClientScriptLoader,
        private readonly consume: (payload: WidgetServerPayload) => void) {}

    enqueue = (payload: WidgetServerPayload): void => { this.pending.push(payload); this.flush(); };
    clear(): void { this.pending = []; }

    flush(): void {
        while (this.pending.length && this.ready(this.pending[0])) {
            this.consume(this.pending.shift()!);
        }
    }

    private ready(payload: WidgetServerPayload): boolean {
        const ids = new Set<number>();
        const manager = this.widgets();
        const groups = new Set<number>();
        if (payload.action === "set_root" || payload.action === "open_sub" || payload.action === "open") {
            groups.add(payload.groupId);
        }
        if (payload.action === "open_sub" || payload.action === "close_sub") {
            // Mount changes run the *parent's* runtime onSubChange callbacks too.
            // These callbacks are installed by onLoad, not necessarily INVOKEd by it.
            if (manager.rootInterface >= 0) groups.add(manager.rootInterface);
            groups.add(payload.targetUid >>> 16);
        }
        for (const groupId of groups) {
            const group = manager.getGroup(groupId);
            if (!group) return false;
            for (const widget of group.widgetsByUid.values()) {
                for (const [key, value] of Object.entries(widget)) {
                    if (key.startsWith("on") && Array.isArray(value) && typeof value[0] === "number" && value[0] > 0) ids.add(value[0]);
                }
                for (const handler of Object.values(widget.eventHandlers ?? {})) {
                    if (handler?.scriptId > 0) ids.add(handler.scriptId);
                }
            }
        }
        if (payload.action === "open_sub") {
            if (!manager.getWidgetByUid(payload.targetUid)) return false;
            for (const script of [...(payload.preScripts ?? []), ...(payload.postScripts ?? [])]) ids.add(script.scriptId);
        }
        if (payload.action === "run_script") ids.add(payload.scriptId);
        let ready = true;
        const visited = new Set<number>();
        for (const id of ids) ready = this.scripts().isProgramReady(id, visited) && ready;
        return ready;
    }
}
