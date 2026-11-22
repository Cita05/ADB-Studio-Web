"use strict";
// MV3 service worker: the app lives in a full-size extension tab, because
// `navigator.usb.requestDevice()` requires a visible page (not a worker).
const APP_PAGE = "index.html";
async function openApp() {
    const url = chrome.runtime.getURL(APP_PAGE);
    const tabs = await chrome.tabs.query({ url });
    const existing = tabs[0];
    if (existing?.id != null) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId != null) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
        return;
    }
    await chrome.tabs.create({ url });
}
chrome.action.onClicked.addListener(() => {
    void openApp();
});
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        void chrome.tabs.create({ url: chrome.runtime.getURL(APP_PAGE) });
    }
});
