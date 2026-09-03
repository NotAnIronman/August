import { useEffect, useRef } from "react";

import { Renderer } from "@client/engine/rendering/core/Renderer";

export interface CanvasProps {
    renderer: Renderer;
}

export function Canvas({ renderer }: CanvasProps): JSX.Element {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = divRef.current;
        if (!host) {
            return;
        }
        let active = true;
        host.appendChild(renderer.canvas);
        renderer.attachResizeObserver();
        const resizeFrame = requestAnimationFrame(() => {
            if (active) renderer.forceResize();
        });

        void renderer.initOnce().then(
            () => {
                if (active) {
                    renderer.start();
                } else {
                    // stop() may have run before asynchronous initialization created
                    // its final resources. A second pass makes that teardown complete.
                    renderer.stop();
                }
            },
            (error) => {
                renderer.stop();
                if (active) {
                    console.error("[Canvas] Renderer initialization failed", error);
                }
            },
        );

        return () => {
            active = false;
            cancelAnimationFrame(resizeFrame);
            renderer.stop();
            if (renderer.canvas.parentNode === host) host.removeChild(renderer.canvas);
        };
    }, [renderer]);

    return (
        <div
            ref={divRef}
            style={{ position: "relative", width: "100%", height: "100%" }}
            tabIndex={0}
        />
    );
}
