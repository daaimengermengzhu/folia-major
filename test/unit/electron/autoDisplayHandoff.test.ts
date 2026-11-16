import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createDisplayCoordinator } = require('../../../electron/wallpaper/displayCoordinator.cjs');

type Display = { id: number; bounds: { x: number; y: number; width: number; height: number } };
const primary: Display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const secondary: Display = { id: 2, bounds: { x: -1600, y: -648, width: 1600, height: 2560 } };
const third: Display = { id: 3, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } };

function fixture() {
    const window = { isDestroyed: () => false };
    const state = { attached: true, active: true, exporting: false, current: primary,
        target: secondary, choice: secondary as Display | null, window, displays: [primary, secondary, third] };
    const completions: (() => void)[] = [];
    const moveToRect = vi.fn(() => new Promise<void>(resolve => completions.push(resolve)));
    const rememberDisplay = vi.fn((display: Display) => { state.current = display; });
    const options = {
        platform: 'win32',
        screen: { getAllDisplays: () => state.displays, dipToScreenRect: (_window: unknown, bounds: unknown) => bounds },
        getWindow: () => state.window,
        getChoice: () => state.choice,
        getCurrentDisplay: () => state.current,
        getTargetDisplay: () => state.target,
        rememberDisplay,
        isWindowsActive: () => state.active,
        isX11Active: () => false,
        isExporting: () => state.exporting,
        windowsWallpaper: { isAttached: () => state.attached, moveToRect },
        applyMac: vi.fn(() => true), requestPlaybackHandoff: vi.fn(async () => {}), relaunchX11: vi.fn(),
    };
    const coordinator = createDisplayCoordinator(options);
    return { state, options, coordinator, moveToRect, rememberDisplay,
        finish: () => { const finish = completions.shift(); if (!finish) throw new Error('No pending move'); finish(); } };
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

describe('display coordinator', () => {
    it('moves the same window without requesting an audio handoff', async () => {
        const f = fixture();
        const moving = f.coordinator.apply({ choiceChanged: true }); await flush();
        expect(f.moveToRect).toHaveBeenCalledWith(secondary.bounds);
        f.finish(); expect(await moving).toBe(true);
        expect(f.state.current).toEqual(secondary);
        expect(f.options.requestPlaybackHandoff).not.toHaveBeenCalled();
    });

    it('reapplies same-monitor geometry only when explicitly requested', async () => {
        const f = fixture(); f.state.current = secondary;
        expect(await f.coordinator.apply({ choiceChanged: true })).toBe(false);
        const moving = f.coordinator.apply({ forceGeometry: true }); await flush();
        f.finish(); expect(await moving).toBe(true);
    });

    it('serializes a return request behind the native move already in progress', async () => {
        const f = fixture(); const first = f.coordinator.apply({ choiceChanged: true }); await flush();
        f.state.target = primary; f.state.choice = primary;
        const back = f.coordinator.apply({ choiceChanged: true });
        expect(f.moveToRect).toHaveBeenCalledTimes(1);
        f.finish(); await first; await flush();
        expect(f.moveToRect).toHaveBeenLastCalledWith(primary.bounds);
        f.finish(); expect(await back).toBe(true); expect(f.state.current).toEqual(primary);
    });

    it('uses the latest target when several requests are queued', async () => {
        const f = fixture(); const first = f.coordinator.apply({ choiceChanged: true }); await flush();
        const skipped = f.coordinator.apply({ forceGeometry: true });
        f.state.target = third; f.state.choice = third;
        const latest = f.coordinator.apply({ choiceChanged: true });
        f.finish(); await first; expect(await skipped).toBe(false); await flush();
        expect(f.moveToRect).toHaveBeenCalledTimes(2);
        expect(f.moveToRect).toHaveBeenLastCalledWith(third.bounds);
        f.finish(); expect(await latest).toBe(true);
    });

    it('retains a manual choice made before the helper is attached', async () => {
        const f = fixture(); f.state.attached = false;
        expect(await f.coordinator.apply({ choiceChanged: true })).toBe(false);
        expect(f.moveToRect).not.toHaveBeenCalled();
        f.state.attached = true;
        const replay = f.coordinator.onAttached(); await flush();
        f.finish(); expect(await replay).toBe(true);
        expect(f.state.current).toEqual(secondary);
        expect(await f.coordinator.onAttached()).toBe(false);
    });

    it('replays only the newest manual selection after recovery', async () => {
        const f = fixture(); f.state.attached = false;
        await f.coordinator.apply({ choiceChanged: true });
        f.state.target = third; f.state.choice = third;
        await f.coordinator.apply({ choiceChanged: true });
        f.state.attached = true;
        const replay = f.coordinator.onAttached(); await flush();
        expect(f.moveToRect).toHaveBeenCalledOnce();
        expect(f.moveToRect).toHaveBeenCalledWith(third.bounds);
        f.finish(); await replay;
    });

    it('drops a stale deferred automatic action when automatic mode is disabled', async () => {
        const f = fixture(); f.state.attached = false; let enabled = true;
        await f.coordinator.apply({ choiceChanged: true, canApply: () => enabled });
        enabled = false; f.state.attached = true;
        expect(await f.coordinator.onAttached()).toBe(false);
        expect(f.moveToRect).not.toHaveBeenCalled();
    });

    it('retains the requested target when the helper dies during dispatch', async () => {
        const f = fixture();
        f.moveToRect.mockImplementationOnce(async () => { f.state.attached = false; throw new Error('session ended'); });
        await expect(f.coordinator.apply({ choiceChanged: true })).rejects.toThrow('session ended');
        expect(f.rememberDisplay).not.toHaveBeenCalled();
        f.state.attached = true;
        const replay = f.coordinator.onAttached(); await flush();
        f.finish(); expect(await replay).toBe(true);
    });

    it('does not commit or retry a failed native move while the helper remains attached', async () => {
        const f = fixture(); f.moveToRect.mockRejectedValueOnce(new Error('host unavailable'));
        await expect(f.coordinator.apply({ choiceChanged: true })).rejects.toThrow('host unavailable');
        expect(f.rememberDisplay).not.toHaveBeenCalled();
        expect(await f.coordinator.onAttached()).toBe(false);
    });

    it('does not commit a move after its window was replaced', async () => {
        const f = fixture(); const moving = f.coordinator.apply({ choiceChanged: true }); await flush();
        f.state.window = { isDestroyed: () => false }; f.finish();
        expect(await moving).toBe(false); expect(f.rememberDisplay).not.toHaveBeenCalled();
    });

    it('waits for in-flight native completion before export and suppresses queued moves', async () => {
        const f = fixture(); const moving = f.coordinator.apply({ choiceChanged: true }); await flush();
        const queued = f.coordinator.apply({ forceGeometry: true });
        const prepare = vi.fn(() => { f.state.exporting = true; return 'ready'; });
        const exporting = f.coordinator.prepareExport(prepare);
        await flush(); expect(prepare).not.toHaveBeenCalled();
        f.finish(); await moving; expect(await queued).toBe(false);
        expect(await exporting).toBe('ready');
        expect(await f.coordinator.apply({ forceGeometry: true })).toBe(false);
        f.state.exporting = false;
        const restored = f.coordinator.apply({ forceGeometry: true }); await flush();
        f.finish(); expect(await restored).toBe(true);
    });

    it('releases the export barrier after failed preparation', async () => {
        const f = fixture();
        await expect(f.coordinator.prepareExport(() => { throw new Error('export failed'); })).rejects.toThrow('export failed');
        const moving = f.coordinator.apply({ choiceChanged: true }); await flush();
        f.finish(); expect(await moving).toBe(true);
    });

    it('preserves the existing macOS and X11 paths', async () => {
        const f = fixture();
        expect(await createDisplayCoordinator({ ...f.options, platform: 'darwin' }).apply()).toBe(true);
        expect(f.options.applyMac).toHaveBeenCalledOnce();
        const x11 = createDisplayCoordinator({ ...f.options, platform: 'linux',
            isWindowsActive: () => false, isX11Active: () => true });
        expect(await x11.apply({ choiceChanged: true })).toBe(true);
        expect(f.options.requestPlaybackHandoff).toHaveBeenCalledOnce();
        expect(f.options.relaunchX11).toHaveBeenCalledOnce();
        expect(f.moveToRect).not.toHaveBeenCalled();
    });
});
