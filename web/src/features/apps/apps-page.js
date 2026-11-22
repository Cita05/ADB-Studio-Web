import { button, card, confirmDialog, el, icon, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { pickFile, saveBlob } from "../../shared/fs.js";
import { packagePaths } from "../../services/adb/streams.js";
import { pageHeader, requireDevice } from "../../app/page-kit.js";

const PKG_COMMANDS = {
    enable: (pkg) => `shell pm enable ${pkg}`,
    disable: (pkg) => `shell pm disable ${pkg}`,
    start: (pkg) => `shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`,
    force_stop: (pkg) => `shell am force-stop ${pkg}`,
    clear: (pkg) => `shell pm clear ${pkg}`,
    uninstall: (pkg) => `uninstall ${pkg}`,
};
const CONFIRM_ACTIONS = { clear: "clear all data of this app", uninstall: "uninstall this app" };
const FILTERS = [["", "List All Apps"], ["-s", "List System Apps"], ["-3", "List Third-Party Apps"]];
export function createSoftwarePage(ctx) {
    let body = null;
    let packages = [];
    let filter = "";
    let search = "";
    let selected = "";
    let loading = false;
    let installFile = null;
    let installProgress = 0;
    let installing = false;
    const adb = ctx.adb;
    const iconCache = new Map();
    const iconPending = new Set();
    const iconQueue = [];
    let iconObserver = null;
    let activeIcons = 0;

    const iconLetter = (pkg) => (pkg.split(".").pop()?.[0] ?? "?").toUpperCase();
    const iconHue = (pkg) => [...pkg].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 360, 0);
    const paintIcon = (node, pkg) => {
        const data = iconCache.get(pkg);
        node.replaceChildren();
        node.style.background = data ? "transparent" : `hsl(${iconHue(pkg)} 42% 32%)`;
        node.appendChild(data ? el("img", { src: data, alt: "", loading: "lazy" }) : el("span", null, iconLetter(pkg)));
    };
    const runIconQueue = () => {
        while (activeIcons < 2 && iconQueue.length) {
            const task = iconQueue.shift();
            activeIcons += 1;
            void task().finally(() => {
                activeIcons -= 1;
                runIconQueue();
            });
        }
    };
    const queueIcon = (pkg) => {
        if (iconCache.has(pkg) || iconPending.has(pkg))
            return;
        iconPending.add(pkg);
        iconQueue.push(async () => {
            const data = await adb.appIconDataUrl(pkg);
            iconCache.set(pkg, data ?? "");
            iconPending.delete(pkg);
            for (const node of body?.querySelectorAll(".app-icon") ?? []) {
                if (node.dataset.pkg === pkg)
                    paintIcon(node, pkg);
            }
        });
        runIconQueue();
    };
    async function refreshList() {
        if (!adb.connected || loading)
            return;
        loading = true;
        paint();
        try {
            packages = await adb.listPackages(filter);
            adb.log(`Found ${packages.length} apps`, "ok");
        }
        catch (error) {
            toast(errorText(error), "err");
        }
        finally {
            loading = false;
            paint();
        }
    }
    async function readForeground() {
        try {
            const pkg = await adb.foregroundPackage();
            if (pkg) {
                selected = pkg;
                adb.log(`Foreground package: ${pkg}`, "ok");
                paint();
            }
            else {
                toast("Failed to get foreground package", "warn");
            }
        }
        catch (error) {
            toast(errorText(error), "err");
        }
    }
    async function runPackageAction(action) {
        const pkg = selected.trim();
        if (!pkg) {
            toast("Please select an app first", "warn");
            return;
        }
        if (action === "export") {
            await exportApk(pkg);
            return;
        }
        const confirmText = CONFIRM_ACTIONS[action];
        if (confirmText && !(await confirmDialog(`Are you sure to ${confirmText}?`, { danger: true })))
            return;
        await adb.runAdbLine(PKG_COMMANDS[action](pkg));
        if (action === "uninstall")
            await refreshList();
    }
    async function exportApk(pkg) {
        try {
            const { stdout } = await adb.shell(`pm path ${pkg}`, 20_000);
            const path = packagePaths(stdout)[0];
            if (!path) {
                toast("Error", "err");
                return;
            }
            adb.log("Pulling APK…", "info");
            const bytes = await adb.pullFile(path, (read) => {
                if (read % (256 * 1024) < 64 * 1024)
                    adb.log(`Saving... ${(read / 1024 / 1024).toFixed(1)} MB`, "info");
            });
            const name = await saveBlob(new Blob([new Uint8Array(bytes)], { type: "application/vnd.android.package-archive" }), `${pkg}.apk`, "APK", ".apk");
            if (name) {
                adb.log(`Exported: ${name}`, "ok");
                toast(`Saved ${name}`, "ok");
            }
        }
        catch (error) {
            toast(errorText(error), "err");
        }
    }
    async function install(reinstall) {
        if (!installFile) {
            toast("Please select an APK file", "warn");
            return;
        }
        installing = true;
        installProgress = 0;
        paint();
        try {
            const ok = await adb.installApk(installFile, reinstall, (sent, total) => {
                installProgress = Math.round((sent / total) * 100);
                const bar = body?.querySelector(".install-progress i");
                if (bar)
                    bar.style.width = `${installProgress}%`;
            });
            if (ok)
                toast("Installed", "ok");
        }
        catch (error) {
            toast(`Install failed: ${errorText(error)}`, "err");
        }
        finally {
            installing = false;
            installProgress = 0;
            paint();
            await refreshList();
        }
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("Software Management", "Manage", button("Refresh", { icon: "refresh", small: true, disabled: !adb.connected || loading, onClick: () => void refreshList() })));
        const empty = requireDevice(adb, () => ctx.shell.connectUsbDialog());
        if (empty) {
            body.appendChild(empty);
            return;
        }
        const filtered = packages.filter((pkg) => !search || pkg.toLowerCase().includes(search.toLowerCase()));
        const list = el("div", { class: "list" });
        if (!filtered.length) {
            list.appendChild(el("div", { class: "muted small", style: "padding:14px" }, loading ? "Loading…" : "No packages yet — choose a filter above."));
        }
        iconObserver?.disconnect();
        iconObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting)
                    continue;
                iconObserver.unobserve(entry.target);
                queueIcon(entry.target.dataset.pkg);
            }
        });
        for (const pkg of filtered.slice(0, 400)) {
            const iconNode = el("span", { class: "app-icon", "data-pkg": pkg });
            paintIcon(iconNode, pkg);
            if (!iconCache.has(pkg))
                iconObserver.observe(iconNode);
            const row = el("div", { class: `list-item${pkg === selected ? " selected" : ""}` }, iconNode, el("span", { class: "name grow" }, pkg), pkg === selected ? el("span", { class: "badge blue" }, "Selected package") : null);
            row.addEventListener("click", () => {
                selected = pkg;
                paint();
            });
            list.appendChild(row);
        }
        const searchInput = el("input", {
            class: "input",
            placeholder: "Filter packages…",
            value: search,
            style: "height:32px",
        });
        searchInput.addEventListener("input", () => {
            search = searchInput.value;
            paint();
            const next = body?.querySelector(".software-search");
            if (next) {
                next.focus();
                next.setSelectionRange(next.value.length, next.value.length);
            }
        });
        searchInput.classList.add("software-search");
        const filterChips = el("div", { class: "chip-row" }, ...FILTERS.map(([value, label]) => el("button", { class: `chip${filter === value ? " active" : ""}`, dataset: { value } }, label)));
        filterChips.querySelectorAll(".chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                filter = chip.dataset.value;
                void refreshList();
            });
        });
        const listCard = card("Software Management", el("div", { class: "stack" }, el("div", { class: "row" }, filterChips), searchInput, list), { icon: "apps", actions: [el("span", { class: "badge blue" }, String(packages.length))] });
        const actionButtons = [
            ["enable", "Enable", "check"],
            ["disable", "Disable", "x"],
            ["start", "Start", "play"],
            ["force_stop", "Force Stop", "stop"],
            ["export", "Export APK", "download"],
            ["clear", "Clear Data", "trash"],
            ["uninstall", "Uninstall", "trash"],
        ];
        const actionsCard = card("Package Management", el("div", { class: "row tight" }, ...actionButtons.map(([action, label, iconName]) => button(label, {
            icon: iconName,
            small: true,
            variant: action === "uninstall" || action === "clear" ? "danger" : "ghost",
            onClick: () => void runPackageAction(action),
        }))), { icon: "settings", sub: selected || undefined, actions: [button("Get Foreground", { icon: "search", small: true, onClick: () => void readForeground() })] });
        const fileLabel = el("div", { class: "muted small" }, installFile ? `${installFile.name} · ${(installFile.size / 1024 / 1024).toFixed(1)} MB` : "or drop an .apk file here");
        const drop = el("div", {
            class: "hint",
            style: "border-style:dashed;text-align:center;padding:22px;cursor:pointer",
        }, icon("upload", 22), el("div", { style: "margin-top:6px;font-weight:650" }, "Choose an APK"), fileLabel);
        const choose = async () => {
            const file = await pickFile(".apk,application/vnd.android.package-archive");
            if (file) {
                installFile = file;
                paint();
            }
        };
        drop.addEventListener("click", () => void choose());
        drop.addEventListener("dragover", (event) => event.preventDefault());
        drop.addEventListener("drop", (event) => {
            event.preventDefault();
            const file = event.dataTransfer?.files?.[0];
            if (file) {
                installFile = file;
                paint();
            }
        });
        const installCard = card("Install APK", el("div", { class: "stack" }, drop, installing
            ? el("div", { class: "progress install-progress" }, el("i", { style: `width:${installProgress}%` }))
            : null, el("div", { class: "row" }, button("Install", { variant: "primary", icon: "download", small: true, onClick: () => void install(false) }), button("Reinstall", { icon: "refresh", small: true, onClick: () => void install(true) }))), { icon: "download" });
        body.append(el("div", { class: "grid sidebar-right" }, listCard, el("div", { class: "stack" }, actionsCard, installCard)));
    }
    return {
        id: "software",
        icon: "apps",
        label: "Software",
        section: "manage",
        render(root) {
            body = root;
            paint();
            if (adb.connected && !packages.length)
                void refreshList();
        },
        onShow() {
            if (adb.connected && !packages.length)
                void refreshList();
        },
    };
}
