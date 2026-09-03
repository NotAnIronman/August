import { getPublicAssetUrl } from "@client/core/config/publicAssets";

const SERVICE_WORKER_URL = getPublicAssetUrl("service-worker.js");

export function registerServiceWorker(): void {
    const isProd = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
    if (!isProd) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register(SERVICE_WORKER_URL)
            .then((registration) => registration.update())
            .catch((err) => {
                console.warn("[sw] registration failed", err);
            });
    });
}

export function unregisterServiceWorker(): void {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((registration) => registration.unregister()).catch(() => {});
}
