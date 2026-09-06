import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import {
    type BossHealthHudMarker,
    BossHealthHudStore,
    formatBossHealthHudPercent,
    getBossHealthHudHue,
    getNextBossHealthHudMarker,
} from "@client/features/boss-health/BossHealthHudStore";
import {
    bossHealthBarPreferences,
    type BossHealthBarStyle,
} from "@client/features/boss-health/BossHealthBarPreferences";
import "@client/features/boss-health/BossHealthHud.css";

export interface BossHealthHudProps {
    readonly store: BossHealthHudStore;
    readonly style?: BossHealthBarStyle;
}

type BossHealthCssProperties = CSSProperties & {
    "--boss-health-fill"?: string;
    "--boss-health-trail"?: string;
    "--boss-health-hue"?: string;
    "--boss-marker-position"?: string;
};

const healthNumberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
});

function formatMarkerPercent(percent: number): string {
    return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, "");
}

function markerAriaLabel(marker: BossHealthHudMarker, reached: boolean): string {
    const gate = marker.label ? `${marker.label}, ` : "";
    return `${gate}${formatMarkerPercent(marker.percent)} percent health${
        reached ? ", reached" : ", upcoming"
    }`;
}

export function BossHealthHud({
    store,
    style: styleOverride,
}: BossHealthHudProps): JSX.Element | null {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
    const preferredStyle = useSyncExternalStore(
        bossHealthBarPreferences.subscribe,
        bossHealthBarPreferences.getSnapshot,
        bossHealthBarPreferences.getSnapshot,
    );
    const hudStyle = styleOverride ?? preferredStyle;
    const [trailPercent, setTrailPercent] = useState(state.precisePercent);
    const trailIdentity = useRef("");

    useEffect(() => {
        if (!state.active) {
            trailIdentity.current = "";
            setTrailPercent(0);
            return;
        }

        // The old-school presentation deliberately has no delayed damage trail.
        if (hudStyle === "oldschool") {
            setTrailPercent(state.precisePercent);
            return;
        }

        const identity = `${state.npcTypeId}:${state.name}`;
        if (trailIdentity.current !== identity) {
            trailIdentity.current = identity;
            setTrailPercent(state.precisePercent);
            return;
        }

        // Healing expands both layers immediately. Damage leaves a short,
        // high-contrast wake so large hits remain legible during busy fights.
        if (state.precisePercent >= trailPercent) {
            setTrailPercent(state.precisePercent);
            return;
        }
        const timer = window.setTimeout(() => setTrailPercent(state.precisePercent), 360);
        return () => window.clearTimeout(timer);
    }, [hudStyle, state.active, state.name, state.npcTypeId, state.precisePercent, trailPercent]);

    if (!state.active || hudStyle === "none") return null;

    const nextMarker = getNextBossHealthHudMarker(state.markers, state.precisePercent);
    const cssVariables: BossHealthCssProperties = {
        "--boss-health-fill": `${state.precisePercent}%`,
        "--boss-health-trail": `${trailPercent}%`,
        "--boss-health-hue": String(getBossHealthHudHue(state.precisePercent)),
    };
    const exactHealth = `${healthNumberFormatter.format(state.current)} / ${healthNumberFormatter.format(
        state.maximum,
    )} HP`;
    const displayPercent = formatBossHealthHudPercent(state.precisePercent);

    return (
        <div className="boss-health-hud-layer">
            <section
                className={`boss-health-hud boss-health-hud--${hudStyle}`}
                style={cssVariables}
                aria-label={`${state.name} health`}
                data-revision={state.revision}
                data-style={hudStyle}
            >
                <div className="boss-health-hud__plate">
                    <div className="boss-health-hud__header">
                        <div className="boss-health-hud__identity">
                            <span className="boss-health-hud__kicker">Boss encounter</span>
                            <span className="boss-health-hud__name">{state.name}</span>
                        </div>
                        <div className="boss-health-hud__numbers">
                            <span className="boss-health-hud__exact">{exactHealth}</span>
                            <span className="boss-health-hud__percent">{displayPercent}</span>
                        </div>
                    </div>

                    <div className="boss-health-hud__bar-wrap">
                        <div
                            className="boss-health-hud__track"
                            role="progressbar"
                            aria-label={`${state.name} hitpoints`}
                            aria-valuemin={0}
                            aria-valuemax={state.maximum}
                            aria-valuenow={state.current}
                            aria-valuetext={`${exactHealth}, ${displayPercent}`}
                        >
                            <span className="boss-health-hud__trail" aria-hidden="true" />
                            <span className="boss-health-hud__fill" aria-hidden="true">
                                <span className="boss-health-hud__shine" />
                            </span>
                            <span className="boss-health-hud__track-gloss" aria-hidden="true" />
                            <span className="boss-health-hud__oldschool-readout" aria-hidden="true">
                                {exactHealth} · {displayPercent}
                            </span>
                        </div>

                        {state.markers.length > 0 && (
                            <div className="boss-health-hud__markers">
                                {state.markers.map((marker) => {
                                    const reached = state.precisePercent <= marker.percent;
                                    const isNext = nextMarker?.percent === marker.percent;
                                    const markerStyle: BossHealthCssProperties = {
                                        "--boss-marker-position": `${marker.percent}%`,
                                    };
                                    return (
                                        <span
                                            key={marker.percent}
                                            className={[
                                                "boss-health-hud__marker",
                                                `boss-health-hud__marker--${marker.style}`,
                                                reached
                                                    ? "boss-health-hud__marker--reached"
                                                    : "boss-health-hud__marker--upcoming",
                                                isNext ? "boss-health-hud__marker--next" : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            style={markerStyle}
                                            role="img"
                                            aria-label={markerAriaLabel(marker, reached)}
                                        >
                                            <span className="boss-health-hud__marker-line" />
                                            <span className="boss-health-hud__marker-cap" />
                                            <span className="boss-health-hud__marker-percent">
                                                {formatMarkerPercent(marker.percent)}%
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {nextMarker && (
                        <div className="boss-health-hud__next-gate" aria-live="polite">
                            <span className="boss-health-hud__next-gate-dot" aria-hidden="true" />
                            <span>
                                Next gate
                                {nextMarker.label ? `: ${nextMarker.label}` : ""} at{" "}
                                {formatMarkerPercent(nextMarker.percent)}%
                            </span>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
