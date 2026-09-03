import ReactDOM from "react-dom/client";

import OsrsClientApp from "@client/app/shell/OsrsClientApp";
import "@client/app/index.css";
import { disposeServerConnection, initServerConnection } from "@client/core/network/ServerConnection";
import reportWebVitals from "@client/app/reportWebVitals";
import { Bzip2 } from "@august/osrs-engine/compression/Bzip2";
import { Gzip } from "@august/osrs-engine/compression/Gzip";
import { registerServiceWorker } from "@client/app/serviceWorkerRegistration";
import { installUiDiagnostic } from "@client/ui/runtime/UiScaleDiagnostic";

declare const module: any; // HMR typing

Bzip2.initWasm();
Gzip.initWasm();

// Opt-in URL flag to enable verbose resize debugging
try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("debugResize")) {
        (window as any).__RESIZE_DEBUG__ = true;
        // eslint-disable-next-line no-console
        console.log("[resize] debug enabled via ?debugResize");
    }
} catch {}

// UI scale diagnostic kit — available via __uiDiag in the browser console.
// Add ?debugUi to auto-dump after login; otherwise it remains dormant.
installUiDiagnostic();

// NOTE: Server connection is initialized in OsrsClientApp after widget manager is ready

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    <OsrsClientApp />,
    // </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

registerServiceWorker();

// During Fast Refresh/HMR, close app-level sockets before applying updates
try {
    if (typeof module !== "undefined" && module?.hot) {
        // React Fast Refresh lifecycle: prepare -> apply -> idle
        module.hot.addStatusHandler((status: string) => {
            if (status === "prepare") {
                try {
                    disposeServerConnection("hmr prepare");
                } catch {}
            } else if (status === "idle") {
                try {
                    initServerConnection();
                } catch {}
            }
        });
    }
} catch {}
