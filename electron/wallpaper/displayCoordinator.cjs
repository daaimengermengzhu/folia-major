const { isSameDisplay, shouldMoveWallpaper } = require('./wallpaperDisplay.cjs');

// Serialize monitor changes and export preparation without owning Electron windows or settings.
// Targets are resolved at dispatch time so an unplug, a new manual choice or cancellation wins.
function createDisplayCoordinator({ platform, screen, getWindow, getChoice, getCurrentDisplay,
    getTargetDisplay, rememberDisplay, isWindowsActive, isX11Active, isExporting, windowsWallpaper,
    applyMac, requestPlaybackHandoff, relaunchX11 }) {
    let generation = 0;
    let pending = Promise.resolve();
    let deferred = null;
    let exportPreparations = 0;

    function hasToMove({ choiceChanged, forceGeometry }) {
        try {
            const current = getCurrentDisplay();
            if (isWindowsActive() && forceGeometry) return Boolean(current && getTargetDisplay());
            if (choiceChanged) {
                if (isWindowsActive() && !getChoice()) return false;
                const target = getTargetDisplay();
                return Boolean(current && target) && !isSameDisplay(target, current);
            }
            return shouldMoveWallpaper(screen.getAllDisplays(), getChoice(), current);
        } catch {
            return false;
        }
    }

    const canDispatch = request => request.generation === generation && request.canApply()
        && !exportPreparations && !isExporting() && isWindowsActive();

    async function dispatch(request) {
        if (!canDispatch(request) || !hasToMove(request)) return false;
        const target = getTargetDisplay();
        const win = getWindow();
        if (!target || !win || win.isDestroyed()) return false;
        if (!windowsWallpaper.isAttached()) {
            deferred = request;
            return false;
        }
        try {
            await windowsWallpaper.moveToRect(screen.dipToScreenRect(null, target.bounds));
        } catch (error) {
            // A helper replacement may end an in-flight move. Keep a manual selection for its
            // successor; the automatic policy still has its own cancellation predicate.
            if (canDispatch(request) && !windowsWallpaper.isAttached()) deferred = request;
            throw error;
        }
        if (!isWindowsActive() || win !== getWindow() || win.isDestroyed()) return false;
        rememberDisplay(target);
        return request.generation === generation;
    }

    async function apply({ choiceChanged = false, forceGeometry = false, canApply = () => true } = {}) {
        if (!canApply()) return false;
        if (platform === 'darwin') return applyMac();
        const onWindows = isWindowsActive();
        if (!onWindows && !isX11Active()) return false;
        const request = { choiceChanged, forceGeometry, canApply, generation: ++generation };
        deferred = null;
        if (onWindows) {
            const moving = pending.then(() => dispatch(request));
            pending = moving.catch(() => {});
            return moving;
        }
        if (!hasToMove(request)) return false;
        await requestPlaybackHandoff();
        if (request.generation !== generation || !canApply() || !hasToMove(request) || !isX11Active()) {
            return false;
        }
        relaunchX11();
        return true;
    }

    async function onAttached() {
        const request = deferred;
        if (!request || !canDispatch(request)) return false;
        deferred = null;
        return apply({ ...request, forceGeometry: true });
    }

    async function prepareExport(prepare) {
        exportPreparations += 1;
        try {
            await pending;
            return await prepare();
        } finally {
            exportPreparations -= 1;
        }
    }

    return { apply, onAttached, prepareExport };
}

module.exports = { createDisplayCoordinator };
