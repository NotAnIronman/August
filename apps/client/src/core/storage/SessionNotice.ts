type NoticeStorage = Pick<Storage, "getItem" | "setItem">;
const shownInThisPage = new Set<string>();

/** One presentation per tab session, with a non-throwing in-page fallback. */
export function createSessionNotice(
    key: string,
    getStorage: () => NoticeStorage | undefined = () => globalThis.sessionStorage,
) {
    let available = !shownInThisPage.has(key);
    try {
        if (getStorage()?.getItem(key) === "1") available = false;
    } catch {
        // Blocked storage must never stop the client from starting.
    }
    return {
        canShow: () => available,
        markShown() {
            if (!available) return;
            shownInThisPage.add(key);
            try { getStorage()?.setItem(key, "1"); } catch {}
            // Keep the current presentation visible; only future mounts/reloads
            // are suppressed. Further messages can join this same banner.
        },
        dismiss() {
            available = false;
        },
    };
}
