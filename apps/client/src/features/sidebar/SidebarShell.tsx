import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ClientGraphicsSettings } from "./ClientGraphicsSettings";

import type { OsrsClient } from "@client/engine/game/OsrsClient";
import {
    bossHealthBarPreferences,
    type BossHealthBarStyle,
} from "@client/features/boss-health/BossHealthBarPreferences";
import { compileGroundItemRules } from "@client/features/plugins/grounditems/GroundItemRuleEngine";
import type { GroundItemsPluginConfig } from "@client/features/plugins/grounditems/types";
import type { InteractHighlightPluginConfig } from "@client/features/plugins/interacthighlight/types";
import type { TileMarkersPluginConfig } from "@client/features/plugins/tilemarkers/types";
import "@client/features/sidebar/SidebarShell.css";
import { MenuEntrySwapperPanel } from "@client/features/plugins/menuentryswapper/SidebarPlugin";
import type { SidebarStore } from "@client/features/sidebar/SidebarStore";
import type { ClientSidebarEntryData, SidebarPanelId } from "@client/features/sidebar/entries";
import type { SidebarRailIconRenderer } from "@client/features/sidebar/pluginTypes";

function toColorInput(color: number): string {
    const hex = (Math.max(0, color | 0) & 0xffffff).toString(16).padStart(6, "0");
    return `#${hex}`;
}

function parseColorInput(raw: string, fallback: number): number {
    const match = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
    if (!match) return fallback;
    return parseInt(match[1], 16) & 0xffffff;
}

function parseInteger(raw: string, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function SidebarRailIcon({
    icon,
    label,
}: {
    icon?: SidebarRailIconRenderer;
    label: string;
}): JSX.Element {
    if (!icon) {
        return <span className="rl-sidebar-icon-fallback">{label.slice(0, 1).toUpperCase()}</span>;
    }
    const Icon = icon;
    return <Icon label={label} />;
}

function SidebarToggleGlyph({ open }: { open: boolean }): JSX.Element {
    return (
        <svg className="rl-sidebar-toggle-chevron" viewBox="0 0 12 20" aria-hidden="true">
            <path d={open ? "M3.6 3.1L8.1 10l-4.5 6.9" : "M8.4 3.1L3.9 10l4.5 6.9"} />
        </svg>
    );
}

function SidebarNotesPanel({ osrsClient }: { osrsClient: OsrsClient }): JSX.Element {
    const plugin = osrsClient.notesPlugin;
    const subscribe = useCallback((listener: () => void) => plugin.subscribe(listener), [plugin]);
    const getSnapshot = useCallback(() => plugin.getState(), [plugin]);
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const onChange = useCallback(
        (value: string) => {
            plugin.setConfig({ notes: value });
        },
        [plugin],
    );

    return (
        <div className="rl-sidebar-panel-content">
            <div className="rl-sidebar-panel-title">Notes</div>
            <textarea
                className="rl-sidebar-notes-input"
                value={state.config.notes}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Write notes for plugin work here."
            />
        </div>
    );
}

function GroundItemsPanel({ osrsClient }: { osrsClient: OsrsClient }): JSX.Element {
    const plugin = osrsClient.groundItemsPlugin;
    const subscribe = useCallback((listener: () => void) => plugin.subscribe(listener), [plugin]);
    const getSnapshot = useCallback(() => plugin.getState(), [plugin]);
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const config = state.config;
    const [ruleDraft, setRuleDraft] = useState(config.advancedFilterRules);
    useEffect(() => {
        setRuleDraft(config.advancedFilterRules);
    }, [config.advancedFilterRules]);
    const ruleDiagnostics = useMemo(
        () => compileGroundItemRules(ruleDraft).diagnostics,
        [ruleDraft],
    );
    const ruleDraftChanged = ruleDraft !== config.advancedFilterRules;

    const update = useCallback(
        <K extends keyof GroundItemsPluginConfig>(key: K, value: GroundItemsPluginConfig[K]) => {
            plugin.setConfig({ [key]: value } as Partial<GroundItemsPluginConfig>);
        },
        [plugin],
    );

    return (
        <div className="rl-sidebar-panel-content rl-sidebar-scrollable">
            <div className="rl-sidebar-panel-title">Ground Items</div>
            <p className="rl-sidebar-panel-copy">
                Control labels, menus, tile highlights, loot beams, and local loot filters from
                one place.
            </p>
            <label className="rl-sidebar-check rl-sidebar-ground-master-toggle">
                <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => update("enabled", event.target.checked)}
                />
                <span>Enable Ground Items</span>
            </label>

            <div className="rl-sidebar-callout">
                Hold <kbd>Alt</kbd> to reveal filtered items. Double-tap <kbd>Alt</kbd> to toggle
                ground-item overlays without changing your filters. While holding it, right-click
                a ground item to highlight or hide that item by name.
            </div>

            <details className="rl-sidebar-settings-group" open>
                <summary>Labels &amp; visibility</summary>
                <div className="rl-sidebar-settings-body">
                    <div className="rl-sidebar-row">
                        <label className="rl-sidebar-field">
                            <span>Colour highlight surfaces</span>
                            <select
                                value={config.itemHighlightMode}
                                onChange={(event) =>
                                    update(
                                        "itemHighlightMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["itemHighlightMode"],
                                    )
                                }
                            >
                                <option value="both">Labels and menus</option>
                                <option value="overlay">Labels only</option>
                                <option value="menu">Menus only</option>
                                <option value="none">Neither (default label colour)</option>
                            </select>
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Ownership filter</span>
                            <select
                                value={config.ownershipFilterMode}
                                onChange={(event) =>
                                    update(
                                        "ownershipFilterMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["ownershipFilterMode"],
                                    )
                                }
                            >
                                <option value="all">All items</option>
                                <option value="takeable">Takeable only</option>
                                <option value="drops">Your drops</option>
                            </select>
                        </label>
                    </div>

                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.showHighlightedOnly}
                            onChange={(event) =>
                                update("showHighlightedOnly", event.target.checked)
                            }
                        />
                        <span>Show highlighted items only</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.dontHideUntradeables}
                            onChange={(event) =>
                                update("dontHideUntradeables", event.target.checked)
                            }
                        />
                        <span>Protect untradeables from value filtering</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.textOutline}
                            onChange={(event) => update("textOutline", event.target.checked)}
                        />
                        <span>Outline ground-item text</span>
                    </label>

                    <div className="rl-sidebar-row">
                        <label className="rl-sidebar-field">
                            <span>Price display</span>
                            <select
                                value={config.priceDisplayMode}
                                onChange={(event) =>
                                    update(
                                        "priceDisplayMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["priceDisplayMode"],
                                    )
                                }
                            >
                                <option value="both">GE and HA</option>
                                <option value="ge">Grand Exchange</option>
                                <option value="ha">High Alchemy</option>
                                <option value="off">Off</option>
                            </select>
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Value calculation</span>
                            <select
                                value={config.valueCalculationMode}
                                onChange={(event) =>
                                    update(
                                        "valueCalculationMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["valueCalculationMode"],
                                    )
                                }
                            >
                                <option value="highest">Highest value</option>
                                <option value="ge">Grand Exchange</option>
                                <option value="ha">High Alchemy</option>
                            </select>
                        </label>
                    </div>

                    <div className="rl-sidebar-row">
                        <label className="rl-sidebar-field">
                            <span>Despawn timer</span>
                            <select
                                value={config.despawnTimerMode}
                                onChange={(event) =>
                                    update(
                                        "despawnTimerMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["despawnTimerMode"],
                                    )
                                }
                            >
                                <option value="off">Off</option>
                                <option value="ticks">Ticks</option>
                                <option value="seconds">Seconds</option>
                            </select>
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Hide below value</span>
                            <input
                                type="number"
                                min={0}
                                value={config.hideUnderValue}
                                onChange={(event) =>
                                    update(
                                        "hideUnderValue",
                                        parseInteger(event.target.value, config.hideUnderValue),
                                    )
                                }
                            />
                            <small className="rl-sidebar-field-help">
                                An item is filtered only when both its GE and HA totals are below
                                this value, protecting valuable alchables. Set to 0 to disable.
                            </small>
                        </label>
                    </div>

                    <label className="rl-sidebar-field">
                        <span>Alt double-tap window (ms)</span>
                        <input
                            type="number"
                            min={0}
                            max={5000}
                            step={50}
                            value={config.doubleTapDelayMs}
                            onChange={(event) =>
                                update(
                                    "doubleTapDelayMs",
                                    Math.min(
                                        5000,
                                        parseInteger(event.target.value, config.doubleTapDelayMs),
                                    ),
                                )
                            }
                        />
                        <small className="rl-sidebar-field-help">
                            Set to 0 to disable the double-tap shortcut.
                        </small>
                    </label>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>Ground-item menus</summary>
                <div className="rl-sidebar-settings-body">
                    <div className="rl-sidebar-row">
                        <label className="rl-sidebar-field">
                            <span>Color menu text</span>
                            <select
                                value={config.menuHighlightMode}
                                onChange={(event) =>
                                    update(
                                        "menuHighlightMode",
                                        event.target
                                            .value as GroundItemsPluginConfig["menuHighlightMode"],
                                    )
                                }
                            >
                                <option value="both">Option and name</option>
                                <option value="name">Item name</option>
                                <option value="option">Option</option>
                            </select>
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Menu sorting</span>
                            <select
                                value={config.menuSortMode}
                                onChange={(event) =>
                                    update(
                                        "menuSortMode",
                                        event.target.value as GroundItemsPluginConfig["menuSortMode"],
                                    )
                                }
                            >
                                <option value="off">Game order</option>
                                <option value="value">Highest value</option>
                                <option value="name">Item name</option>
                            </select>
                        </label>
                    </div>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.showMenuItemQuantities}
                            onChange={(event) =>
                                update("showMenuItemQuantities", event.target.checked)
                            }
                        />
                        <span>Show item quantities</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.recolorMenuHiddenItems}
                            onChange={(event) =>
                                update("recolorMenuHiddenItems", event.target.checked)
                            }
                        />
                        <span>Recolor hidden entries</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.rightClickHidden}
                            onChange={(event) => update("rightClickHidden", event.target.checked)}
                        />
                        <span>Move hidden items behind right-click</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.collapseGroundItemMenu}
                            onChange={(event) =>
                                update("collapseGroundItemMenu", event.target.checked)
                            }
                        />
                        <span>Collapse matching menu entries</span>
                    </label>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>Tiles &amp; loot beams</summary>
                <div className="rl-sidebar-settings-body">
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.highlightTiles}
                            onChange={(event) => update("highlightTiles", event.target.checked)}
                        />
                        <span>Highlight tiles beneath items</span>
                    </label>
                    <label className="rl-sidebar-field">
                        <span>Tile fill opacity</span>
                        <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={config.tileHighlightFillAlpha}
                            onChange={(event) => {
                                const parsed = Number(event.target.value);
                                update(
                                    "tileHighlightFillAlpha",
                                    Number.isFinite(parsed)
                                        ? Math.min(1, Math.max(0, parsed))
                                        : config.tileHighlightFillAlpha,
                                );
                            }}
                        />
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.lootBeamEnabled}
                            onChange={(event) => update("lootBeamEnabled", event.target.checked)}
                        />
                        <span>Show loot beams</span>
                    </label>
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.lootBeamForHighlightedItems}
                            onChange={(event) =>
                                update("lootBeamForHighlightedItems", event.target.checked)
                            }
                        />
                        <span>Always beam explicitly highlighted items</span>
                    </label>
                    <div className="rl-sidebar-row">
                        <label className="rl-sidebar-field">
                            <span>Beam style</span>
                            <select
                                value={config.lootBeamStyle}
                                onChange={(event) =>
                                    update(
                                        "lootBeamStyle",
                                        event.target.value as GroundItemsPluginConfig["lootBeamStyle"],
                                    )
                                }
                            >
                                <option value="modern">Modern</option>
                                <option value="light">Light</option>
                            </select>
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Minimum beam tier</span>
                            <select
                                value={config.lootBeamMinimumTier}
                                onChange={(event) =>
                                    update(
                                        "lootBeamMinimumTier",
                                        event.target
                                            .value as GroundItemsPluginConfig["lootBeamMinimumTier"],
                                    )
                                }
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="insane">Insane</option>
                            </select>
                        </label>
                    </div>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>Drop notifications</summary>
                <div className="rl-sidebar-settings-body">
                    <label className="rl-sidebar-check">
                        <input
                            type="checkbox"
                            checked={config.notifyHighlightedDrops}
                            onChange={(event) =>
                                update("notifyHighlightedDrops", event.target.checked)
                            }
                        />
                        <span>Notify for explicitly highlighted drops</span>
                    </label>
                    <label className="rl-sidebar-field">
                        <span>Minimum notification tier</span>
                        <select
                            value={config.notifyMinimumTier}
                            onChange={(event) =>
                                update(
                                    "notifyMinimumTier",
                                    event.target
                                        .value as GroundItemsPluginConfig["notifyMinimumTier"],
                                )
                            }
                        >
                            <option value="off">Off</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="insane">Insane</option>
                        </select>
                    </label>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>Value tiers &amp; colors</summary>
                <div className="rl-sidebar-settings-body">
                    <div className="rl-sidebar-row rl-sidebar-value-row">
                        <label className="rl-sidebar-field">
                            <span>Low value</span>
                            <input
                                type="number"
                                min={0}
                                value={config.lowValuePrice}
                                onChange={(event) =>
                                    update(
                                        "lowValuePrice",
                                        parseInteger(event.target.value, config.lowValuePrice),
                                    )
                                }
                            />
                        </label>
                        <input
                            className="rl-sidebar-color-input"
                            type="color"
                            value={toColorInput(config.lowValueColor)}
                            onChange={(event) =>
                                update(
                                    "lowValueColor",
                                    parseColorInput(event.target.value, config.lowValueColor),
                                )
                            }
                            title="Low value color"
                            aria-label="Low value color"
                        />
                    </div>
                    <div className="rl-sidebar-row rl-sidebar-value-row">
                        <label className="rl-sidebar-field">
                            <span>Medium value</span>
                            <input
                                type="number"
                                min={0}
                                value={config.mediumValuePrice}
                                onChange={(event) =>
                                    update(
                                        "mediumValuePrice",
                                        parseInteger(event.target.value, config.mediumValuePrice),
                                    )
                                }
                            />
                        </label>
                        <input
                            className="rl-sidebar-color-input"
                            type="color"
                            value={toColorInput(config.mediumValueColor)}
                            onChange={(event) =>
                                update(
                                    "mediumValueColor",
                                    parseColorInput(event.target.value, config.mediumValueColor),
                                )
                            }
                            title="Medium value color"
                            aria-label="Medium value color"
                        />
                    </div>
                    <div className="rl-sidebar-row rl-sidebar-value-row">
                        <label className="rl-sidebar-field">
                            <span>High value</span>
                            <input
                                type="number"
                                min={0}
                                value={config.highValuePrice}
                                onChange={(event) =>
                                    update(
                                        "highValuePrice",
                                        parseInteger(event.target.value, config.highValuePrice),
                                    )
                                }
                            />
                        </label>
                        <input
                            className="rl-sidebar-color-input"
                            type="color"
                            value={toColorInput(config.highValueColor)}
                            onChange={(event) =>
                                update(
                                    "highValueColor",
                                    parseColorInput(event.target.value, config.highValueColor),
                                )
                            }
                            title="High value color"
                            aria-label="High value color"
                        />
                    </div>
                    <div className="rl-sidebar-row rl-sidebar-value-row">
                        <label className="rl-sidebar-field">
                            <span>Insane value</span>
                            <input
                                type="number"
                                min={0}
                                value={config.insaneValuePrice}
                                onChange={(event) =>
                                    update(
                                        "insaneValuePrice",
                                        parseInteger(event.target.value, config.insaneValuePrice),
                                    )
                                }
                            />
                        </label>
                        <input
                            className="rl-sidebar-color-input"
                            type="color"
                            value={toColorInput(config.insaneValueColor)}
                            onChange={(event) =>
                                update(
                                    "insaneValueColor",
                                    parseColorInput(event.target.value, config.insaneValueColor),
                                )
                            }
                            title="Insane value color"
                            aria-label="Insane value color"
                        />
                    </div>
                    <div className="rl-sidebar-color-grid">
                        <label className="rl-sidebar-field">
                            <span>Default</span>
                            <input
                                className="rl-sidebar-color-input rl-sidebar-color-full"
                                type="color"
                                value={toColorInput(config.defaultColor)}
                                onChange={(event) =>
                                    update(
                                        "defaultColor",
                                        parseColorInput(event.target.value, config.defaultColor),
                                    )
                                }
                                title="Default item color"
                            />
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Highlighted</span>
                            <input
                                className="rl-sidebar-color-input rl-sidebar-color-full"
                                type="color"
                                value={toColorInput(config.highlightedColor)}
                                onChange={(event) =>
                                    update(
                                        "highlightedColor",
                                        parseColorInput(event.target.value, config.highlightedColor),
                                    )
                                }
                                title="Explicit highlighted item color"
                            />
                        </label>
                        <label className="rl-sidebar-field">
                            <span>Hidden</span>
                            <input
                                className="rl-sidebar-color-input rl-sidebar-color-full"
                                type="color"
                                value={toColorInput(config.hiddenColor)}
                                onChange={(event) =>
                                    update(
                                        "hiddenColor",
                                        parseColorInput(event.target.value, config.hiddenColor),
                                    )
                                }
                                title="Hidden item color"
                            />
                        </label>
                    </div>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>Item lists</summary>
                <div className="rl-sidebar-settings-body">
                    <label className="rl-sidebar-field">
                        <span>Highlighted items</span>
                        <textarea
                            className="rl-sidebar-textarea"
                            rows={4}
                            value={config.highlightedItems}
                            onChange={(event) => update("highlightedItems", event.target.value)}
                            placeholder="Abyssal whip, *clue scroll*"
                        />
                        <small className="rl-sidebar-field-help">
                            Comma-separated names; <code>*</code> matches any text.
                        </small>
                    </label>
                    <label className="rl-sidebar-field">
                        <span>Hidden items</span>
                        <textarea
                            className="rl-sidebar-textarea"
                            rows={4}
                            value={config.hiddenItems}
                            onChange={(event) => update("hiddenItems", event.target.value)}
                            placeholder="Ashes, Bones, Bronze *"
                        />
                        <small className="rl-sidebar-field-help">
                            Exact matches take priority over wildcard matches.
                        </small>
                    </label>
                </div>
            </details>

            <details className="rl-sidebar-settings-group">
                <summary>
                    Advanced loot filters
                    {ruleDiagnostics.length > 0 && (
                        <span className="rl-sidebar-settings-badge">{ruleDiagnostics.length}</span>
                    )}
                </summary>
                <div className="rl-sidebar-settings-body">
                    <p className="rl-sidebar-panel-copy">
                        Rules run from top to bottom. <code>hide</code>, <code>show</code>,{" "}
                        <code>highlight</code>, and <code>beam</code> stop evaluation;{" "}
                        <code>apply</code> continues to later rules.
                    </p>
                    <label className="rl-sidebar-field">
                        <span>Local filter rules (one per line)</span>
                        <textarea
                            className="rl-sidebar-textarea rl-sidebar-filter-rules"
                            rows={9}
                            value={ruleDraft}
                            onChange={(event) => setRuleDraft(event.target.value)}
                            spellCheck={false}
                            aria-invalid={ruleDiagnostics.length > 0}
                            placeholder={[
                                "name=*clue* | highlight | color=#00ffff | beam=true",
                                "name=Ashes | qty<100 | hide",
                                "area=3200,3200,12 | apply | tile=true",
                            ].join("\n")}
                        />
                        <small className="rl-sidebar-field-help">
                            Changes remain a draft until Apply is pressed. Ownership accepts none,
                            self, or other; group is reserved for future shared-drop ownership.
                        </small>
                    </label>
                    <div className="rl-sidebar-rule-examples" aria-label="Filter examples">
                        <code>name=*clue* | highlight | color=#00ffff | beam=true</code>
                        <code>name=Ashes | qty&lt;100 | hide</code>
                        <code>area=3200,3200,12 | apply | tile=true</code>
                    </div>
                    {ruleDiagnostics.length > 0 ? (
                        <div className="rl-sidebar-rule-diagnostics" role="alert">
                            <strong>Filter issues</strong>
                            <ul>
                                {ruleDiagnostics.map((diagnostic, index) => (
                                    <li key={`${diagnostic.line}:${diagnostic.source}:${index}`}>
                                        <span>Line {diagnostic.line}:</span> {diagnostic.message}
                                        {diagnostic.source.trim().length > 0 && (
                                            <code>{diagnostic.source}</code>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        ruleDraft.trim().length > 0 && (
                            <div className="rl-sidebar-rule-valid">No filter issues found.</div>
                        )
                    )}
                    <div className="rl-sidebar-rule-actions">
                        <button
                            type="button"
                            onClick={() => update("advancedFilterRules", ruleDraft)}
                            disabled={!ruleDraftChanged || ruleDiagnostics.length > 0}
                        >
                            Apply
                        </button>
                        <button
                            type="button"
                            onClick={() => setRuleDraft(config.advancedFilterRules)}
                            disabled={!ruleDraftChanged}
                        >
                            Revert
                        </button>
                    </div>
                </div>
            </details>
        </div>
    );
}

function InteractHighlightPanel({ osrsClient }: { osrsClient: OsrsClient }): JSX.Element {
    const plugin = osrsClient.interactHighlightPlugin;
    const subscribe = useCallback((listener: () => void) => plugin.subscribe(listener), [plugin]);
    const getSnapshot = useCallback(() => plugin.getState(), [plugin]);
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const config = state.config;

    const update = useCallback(
        <K extends keyof InteractHighlightPluginConfig>(
            key: K,
            value: InteractHighlightPluginConfig[K],
        ) => {
            plugin.setConfig({ [key]: value } as Partial<InteractHighlightPluginConfig>);
        },
        [plugin],
    );

    return (
        <div className="rl-sidebar-panel-content rl-sidebar-scrollable">
            <div className="rl-sidebar-panel-title">Interact Highlight</div>
            <p className="rl-sidebar-panel-copy">
                RuneLite-style object highlight. Hover is blue and active interaction is red.
            </p>
            {!config.enabled && (
                <p className="rl-sidebar-panel-copy">Plugin is currently disabled in xRSPS.</p>
            )}
            <label className="rl-sidebar-check">
                <input
                    type="checkbox"
                    checked={config.showHover}
                    onChange={(event) => update("showHover", event.target.checked)}
                />
                <span>Show hover highlight</span>
            </label>
            <label className="rl-sidebar-check">
                <input
                    type="checkbox"
                    checked={config.showInteract}
                    onChange={(event) => update("showInteract", event.target.checked)}
                />
                <span>Show interaction highlight</span>
            </label>
            <div className="rl-sidebar-row rl-sidebar-value-row">
                <label className="rl-sidebar-field">
                    <span>Hover color</span>
                </label>
                <input
                    className="rl-sidebar-color-input"
                    type="color"
                    value={toColorInput(config.hoverColor)}
                    onChange={(event) =>
                        update("hoverColor", parseColorInput(event.target.value, config.hoverColor))
                    }
                    title="Hover highlight color"
                />
            </div>
            <div className="rl-sidebar-row rl-sidebar-value-row">
                <label className="rl-sidebar-field">
                    <span>Interact color</span>
                </label>
                <input
                    className="rl-sidebar-color-input"
                    type="color"
                    value={toColorInput(config.interactColor)}
                    onChange={(event) =>
                        update(
                            "interactColor",
                            parseColorInput(event.target.value, config.interactColor),
                        )
                    }
                    title="Interaction highlight color"
                />
            </div>
        </div>
    );
}

function TileMarkersPanel({ osrsClient }: { osrsClient: OsrsClient }): JSX.Element {
    const plugin = osrsClient.tileMarkersPlugin;
    const subscribe = useCallback((listener: () => void) => plugin.subscribe(listener), [plugin]);
    const getSnapshot = useCallback(() => plugin.getState(), [plugin]);
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const config = state.config;

    const update = useCallback(
        <K extends keyof TileMarkersPluginConfig>(key: K, value: TileMarkersPluginConfig[K]) => {
            plugin.setConfig({ [key]: value } as Partial<TileMarkersPluginConfig>);
        },
        [plugin],
    );

    return (
        <div className="rl-sidebar-panel-content rl-sidebar-scrollable">
            <div className="rl-sidebar-panel-title">Tile Markers</div>
            <p className="rl-sidebar-panel-copy">
                RuneLite-style destination and true tile indicators for your player.
            </p>
            {!config.enabled && (
                <p className="rl-sidebar-panel-copy">Plugin is currently disabled in xRSPS.</p>
            )}
            <label className="rl-sidebar-check">
                <input
                    type="checkbox"
                    checked={config.showDestinationTile}
                    onChange={(event) => update("showDestinationTile", event.target.checked)}
                />
                <span>Highlight destination tile</span>
            </label>
            <label className="rl-sidebar-check">
                <input
                    type="checkbox"
                    checked={config.showCurrentTile}
                    onChange={(event) => update("showCurrentTile", event.target.checked)}
                />
                <span>Highlight true tile</span>
            </label>
            <div className="rl-sidebar-row rl-sidebar-value-row">
                <label className="rl-sidebar-field">
                    <span>Destination color</span>
                </label>
                <input
                    className="rl-sidebar-color-input"
                    type="color"
                    value={toColorInput(config.destinationTileColor)}
                    onChange={(event) =>
                        update(
                            "destinationTileColor",
                            parseColorInput(event.target.value, config.destinationTileColor),
                        )
                    }
                    title="Destination tile color"
                />
            </div>
            <div className="rl-sidebar-row rl-sidebar-value-row">
                <label className="rl-sidebar-field">
                    <span>True tile color</span>
                </label>
                <input
                    className="rl-sidebar-color-input"
                    type="color"
                    value={toColorInput(config.currentTileColor)}
                    onChange={(event) =>
                        update(
                            "currentTileColor",
                            parseColorInput(event.target.value, config.currentTileColor),
                        )
                    }
                    title="True tile color"
                />
            </div>
        </div>
    );
}

function PluginHubPanel({ osrsClient }: { osrsClient: OsrsClient }): JSX.Element {
    type PluginHubToggle = {
        id: string;
        name: string;
        description: string;
        enabled: boolean;
        setEnabled: (enabled: boolean) => void;
    };

    const groundItemsPlugin = osrsClient.groundItemsPlugin;
    const groundItemsSubscribe = useCallback(
        (listener: () => void) => groundItemsPlugin.subscribe(listener),
        [groundItemsPlugin],
    );
    const groundItemsGetSnapshot = useCallback(
        () => groundItemsPlugin.getState(),
        [groundItemsPlugin],
    );
    const groundItemsState = useSyncExternalStore(
        groundItemsSubscribe,
        groundItemsGetSnapshot,
        groundItemsGetSnapshot,
    );

    const notesPlugin = osrsClient.notesPlugin;
    const notesSubscribe = useCallback(
        (listener: () => void) => notesPlugin.subscribe(listener),
        [notesPlugin],
    );
    const notesGetSnapshot = useCallback(() => notesPlugin.getState(), [notesPlugin]);
    const notesState = useSyncExternalStore(notesSubscribe, notesGetSnapshot, notesGetSnapshot);
    const menuSwapper = osrsClient.menuEntrySwapperPlugin;
    const menuSwapperState = useSyncExternalStore(menuSwapper.subscribe, menuSwapper.getState, menuSwapper.getState);

    const interactHighlightPlugin = osrsClient.interactHighlightPlugin;
    const interactHighlightSubscribe = useCallback(
        (listener: () => void) => interactHighlightPlugin.subscribe(listener),
        [interactHighlightPlugin],
    );
    const interactHighlightGetSnapshot = useCallback(
        () => interactHighlightPlugin.getState(),
        [interactHighlightPlugin],
    );
    const interactHighlightState = useSyncExternalStore(
        interactHighlightSubscribe,
        interactHighlightGetSnapshot,
        interactHighlightGetSnapshot,
    );

    const tileMarkersPlugin = osrsClient.tileMarkersPlugin;
    const tileMarkersSubscribe = useCallback(
        (listener: () => void) => tileMarkersPlugin.subscribe(listener),
        [tileMarkersPlugin],
    );
    const tileMarkersGetSnapshot = useCallback(
        () => tileMarkersPlugin.getState(),
        [tileMarkersPlugin],
    );
    const tileMarkersState = useSyncExternalStore(
        tileMarkersSubscribe,
        tileMarkersGetSnapshot,
        tileMarkersGetSnapshot,
    );
    const bossHealthBarStyle = useSyncExternalStore(
        bossHealthBarPreferences.subscribe,
        bossHealthBarPreferences.getSnapshot,
        bossHealthBarPreferences.getSnapshot,
    );

    const bossHealthBarStyles: ReadonlyArray<{
        value: BossHealthBarStyle;
        label: string;
    }> = [
        { value: "modern", label: "Modern" },
        { value: "oldschool", label: "Oldschool" },
    ];

    const pluginToggles = useMemo<PluginHubToggle[]>(
        () => [
            {
                id: "menu_entry_swapper",
                name: "Menu Entry Swapper",
                description: "Saved left-click and shift-click actions. Configure in its sidebar panel.",
                enabled: menuSwapperState.config.enabled,
                setEnabled: enabled => menuSwapper.setConfig({ enabled }),
            },
            {
                id: "ground_items",
                name: "Ground Items",
                description: "Highlights, filters, and recolors item labels.",
                enabled: groundItemsState.config.enabled,
                setEnabled: (enabled: boolean) => {
                    groundItemsPlugin.setConfig({ enabled });
                },
            },
            {
                id: "interact_highlight",
                name: "Interact Highlight",
                description: "Highlights hovered and interacted world objects.",
                enabled: interactHighlightState.config.enabled,
                setEnabled: (enabled: boolean) => {
                    interactHighlightPlugin.setConfig({ enabled });
                },
            },
            {
                id: "tile_markers",
                name: "Tile Markers",
                description: "Highlights destination and true tile positions.",
                enabled: tileMarkersState.config.enabled,
                setEnabled: (enabled: boolean) => {
                    tileMarkersPlugin.setConfig({ enabled });
                },
            },
            {
                id: "notes",
                name: "Notes",
                description: "Persistent local notes for client/plugin tasks.",
                enabled: notesState.config.enabled,
                setEnabled: (enabled: boolean) => {
                    notesPlugin.setConfig({ enabled });
                },
            },
        ],
        [
            groundItemsPlugin,
            groundItemsState.config.enabled,
            menuSwapper,
            menuSwapperState.config.enabled,
            interactHighlightPlugin,
            interactHighlightState.config.enabled,
            notesPlugin,
            notesState.config.enabled,
            tileMarkersPlugin,
            tileMarkersState.config.enabled,
        ],
    );

    return (
        <div className="rl-sidebar-panel-content rl-sidebar-scrollable">
            <div className="rl-sidebar-panel-title">xRSPS</div>
            <p className="rl-sidebar-panel-copy">
                Enable or disable plugins. Toggle states persist in local storage.
            </p>
            {pluginToggles.map((plugin) => (
                <label key={plugin.id} className="rl-sidebar-plugin-toggle">
                    <span className="rl-sidebar-plugin-meta">
                        <span className="rl-sidebar-plugin-name">{plugin.name}</span>
                        <span className="rl-sidebar-plugin-desc">{plugin.description}</span>
                    </span>
                    <input
                        type="checkbox"
                        checked={plugin.enabled}
                        onChange={(event) => plugin.setEnabled(event.target.checked)}
                        aria-label={`Enable ${plugin.name} plugin`}
                    />
                </label>
            ))}
            <section
                className="rl-sidebar-plugin-style-setting"
                aria-labelledby="boss-health-bar-style-name"
            >
                <span className="rl-sidebar-plugin-meta">
                    <span id="boss-health-bar-style-name" className="rl-sidebar-plugin-name">
                        Boss health bar style
                    </span>
                    <span className="rl-sidebar-plugin-desc">
                        Modern is detailed; Oldschool is a compact red/green bar.
                    </span>
                </span>
                <div
                    className="rl-sidebar-style-toggle"
                    role="group"
                    aria-label="Boss Health Bar style"
                >
                    {bossHealthBarStyles.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={bossHealthBarStyle === option.value ? "active" : undefined}
                            aria-pressed={bossHealthBarStyle === option.value}
                            onClick={() => bossHealthBarPreferences.setStyle(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>
            <ClientGraphicsSettings client={osrsClient} />
        </div>
    );
}

export interface SidebarPanelRenderContext {
    osrsClient: OsrsClient;
    selectedEntryId: string;
}

export type SidebarPanelRenderer = (ctx: SidebarPanelRenderContext) => JSX.Element;

export interface SidebarShellProps {
    osrsClient: OsrsClient;
    store: SidebarStore<ClientSidebarEntryData>;
    panelRenderers?: Record<SidebarPanelId, SidebarPanelRenderer>;
}

const DEFAULT_PANEL_RENDERERS: Record<string, SidebarPanelRenderer> = {
    plugin_hub: (ctx) => <PluginHubPanel osrsClient={ctx.osrsClient} />,
    menu_entry_swapper: (ctx) => <MenuEntrySwapperPanel plugin={ctx.osrsClient.menuEntrySwapperPlugin} />,
    ground_items: (ctx) => <GroundItemsPanel osrsClient={ctx.osrsClient} />,
    interact_highlight: (ctx) => <InteractHighlightPanel osrsClient={ctx.osrsClient} />,
    tile_markers: (ctx) => <TileMarkersPanel osrsClient={ctx.osrsClient} />,
    notes: (ctx) => <SidebarNotesPanel osrsClient={ctx.osrsClient} />,
};

export function SidebarShell({
    osrsClient,
    store,
    panelRenderers,
}: SidebarShellProps): JSX.Element {
    const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
    const getSnapshot = useCallback(() => store.getState(), [store]);

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const selectedEntry = useMemo(() => {
        if (!state.selectedId) return undefined;
        return state.entries.find((entry) => entry.id === state.selectedId);
    }, [state.entries, state.selectedId]);
    const pluginHubEntry = useMemo(
        () => state.entries.find((entry) => entry.id === "plugin_hub"),
        [state.entries],
    );

    const resolvedRenderers = useMemo(
        () => ({
            ...DEFAULT_PANEL_RENDERERS,
            ...(panelRenderers ? panelRenderers : {}),
        }),
        [panelRenderers],
    );

    const selectedPanelId = selectedEntry?.data?.panelId;
    const panelRenderer = selectedPanelId ? resolvedRenderers[selectedPanelId] : undefined;
    const shouldShowPanel =
        state.open && selectedEntry !== undefined && panelRenderer !== undefined;
    const drawerTitle = selectedEntry?.title ?? pluginHubEntry?.title ?? "Plugins";

    useEffect(() => {
        if (!shouldShowPanel) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                store.setOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [shouldShowPanel, store]);

    const onDrawerToggle = useCallback(() => {
        if (state.open) {
            store.setOpen(false);
            return;
        }

        if (state.selectedId) {
            store.setOpen(true);
            return;
        }

        const fallbackEntryId =
            pluginHubEntry?.id ?? (state.entries[0] ? state.entries[0].id : null);
        if (fallbackEntryId) {
            store.select(fallbackEntryId);
        }
    }, [pluginHubEntry, state.entries, state.open, state.selectedId, store]);

    const onEntryClick = useCallback(
        (entryId: string) => {
            if (state.open && state.selectedId === entryId) {
                store.setOpen(false);
                return;
            }
            store.select(entryId);
        },
        [state.open, state.selectedId, store],
    );

    return (
        <div className={`rl-sidebar-root ${shouldShowPanel ? "open" : "closed"}`}>
            <div className="rl-sidebar-backdrop" aria-hidden="true" />
            <button
                type="button"
                className={`rl-sidebar-toggle ${shouldShowPanel ? "active" : ""}`}
                onClick={onDrawerToggle}
                aria-label={shouldShowPanel ? "Collapse sidebar" : "Open sidebar"}
                aria-expanded={shouldShowPanel}
                aria-hidden={shouldShowPanel}
                tabIndex={shouldShowPanel ? -1 : 0}
                title={shouldShowPanel ? "Collapse sidebar" : "Open sidebar"}
            >
                <SidebarToggleGlyph open={shouldShowPanel} />
            </button>
            <aside className="rl-sidebar-drawer" aria-hidden={!shouldShowPanel}>
                <div className="rl-sidebar-drawer-header">
                    <div className="rl-sidebar-heading">
                        <div className="rl-sidebar-heading-kicker">xRSPS</div>
                        <div className="rl-sidebar-heading-title">{drawerTitle}</div>
                    </div>
                    <button
                        type="button"
                        className="rl-sidebar-close"
                        onClick={() => store.setOpen(false)}
                        aria-label="Close sidebar"
                        title="Close sidebar"
                    >
                        <SidebarToggleGlyph open={true} />
                    </button>
                </div>
                <div className="rl-sidebar-buttons">
                    {state.entries.map((entry) => {
                        const active = state.selectedId === entry.id;
                        const icon = entry.data?.icon;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                className={`rl-sidebar-button ${active ? "active" : ""}`}
                                onClick={() => onEntryClick(entry.id)}
                                aria-label={entry.title}
                                title={entry.tooltip ? entry.tooltip : entry.title}
                            >
                                <SidebarRailIcon icon={icon} label={entry.title} />
                            </button>
                        );
                    })}
                </div>
                {shouldShowPanel && panelRenderer && selectedEntry && (
                    <section className="rl-sidebar-panel">
                        {panelRenderer({
                            osrsClient,
                            selectedEntryId: selectedEntry.id,
                        })}
                    </section>
                )}
            </aside>
        </div>
    );
}
