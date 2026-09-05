import assert from "node:assert/strict";
import { createSessionNotice } from "@client/core/storage/SessionNotice";

const entries = new Map<string, string>();
const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
const first = createSessionNotice("first-session", () => storage);
assert.equal(first.canShow(), true);
assert.equal(entries.size, 0, "render initialization must not mark an unseen warning as shown");
first.markShown();
first.markShown();
assert.equal(first.canShow(), true, "effect replay must not hide the current banner");
assert.equal(entries.get("first-session"), "1");
first.dismiss();
assert.equal(first.canShow(), false, "late cache warnings cannot reopen the dismissed banner");
assert.equal(createSessionNotice("first-session", () => storage).canShow(), false, "component remount stays suppressed");
// A stored key with no in-page memory models a fresh document after refresh.
entries.set("reloaded-session", "1");
assert.equal(createSessionNotice("reloaded-session", () => storage).canShow(), false);
assert.equal(createSessionNotice("new-tab-session", () => storage).canShow(), true, "a fresh session can show the warning again");
const blocked = () => { throw new Error("Storage access denied"); };
const fallback = createSessionNotice("blocked-session", blocked);
assert.equal(fallback.canShow(), true);
assert.doesNotThrow(() => fallback.markShown());
assert.equal(createSessionNotice("blocked-session", blocked).canShow(), false);
const unavailable = createSessionNotice("unavailable-session", () => undefined);
assert.doesNotThrow(() => unavailable.markShown());
assert.equal(createSessionNotice("unavailable-session", () => undefined).canShow(), false);
console.log("Storage banner: once per tab session, refresh/remount, dismissal, effect replay and blocked storage passed");
