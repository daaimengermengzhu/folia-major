// Isolated, invisible Electron smoke check. Does not open or drive the installed Folia instance.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { _electron } = require('playwright-core');
const root = path.join(repo, 'test-results', 'dualscreen-smoke');
fs.mkdirSync(root, { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'profile-'));
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ STAGE_API_PORT: 32217 }));
const bootstrap = path.join(root, 'bootstrap.cjs');
fs.writeFileSync(bootstrap, `
const electron = require('electron');
const path = require('path');
const fs = require('fs');
process.on('uncaughtException', error => {
    fs.writeFileSync(${JSON.stringify(path.join(root, 'startup-error.log'))}, String(error.stack || error));
    electron.app.exit(1);
});
const repo = ${JSON.stringify(repo)};
const meta = require(path.join(repo, 'package.json'));
electron.app.setName(meta.build.productName);
electron.app.setAppPath(repo);
electron.app.setPath('userData', ${JSON.stringify(profile)});
electron.app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const BrowserWindow = electron.BrowserWindow;
const HiddenWindow = new Proxy(BrowserWindow, {
    construct(target, [options]) {
        const window = new target({ ...options, show: false });
        window.show = () => {};
        window.showInactive = () => {};
        window.focus = () => {};
        return window;
    },
});
const Module = require('node:module');
const originalLoad = Module._load;
const testElectron = new Proxy(electron, {
    get: (target, key) => key === 'BrowserWindow' ? HiddenWindow : Reflect.get(target, key),
});
Module._load = function(request, ...args) {
    return request === 'electron' ? testElectron : Reflect.apply(originalLoad, this, [request, ...args]);
};
require(path.join(repo, 'electron/main.cjs'));
`);

const available = port => new Promise(resolve => {
    const probe = net.createServer();
    probe.on('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
if (!await available(3000) || !await available(32217)) {
    throw new Error('Smoke-check ports are occupied; no existing service was changed.');
}
const log = fs.openSync(path.join(root, 'vite.log'), 'w');
const vite = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), '--port', '3000', '--strictPort'],
    { cwd: repo, stdio: ['ignore', log, log], windowsHide: true });
let desktop;
try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try { ready = (await fetch('http://localhost:3000')).ok; } catch { /* Server still starting. */ }
        if (ready) break;
        if (vite.exitCode !== null) throw new Error('Smoke Vite process exited.');
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Smoke Vite startup timed out.');
    desktop = await _electron.launch({ executablePath: require('electron'),
        args: [`--user-data-dir=${profile}`, bootstrap], cwd: repo,
        env: { ...process.env, ELECTRON_DEV: 'true' }, timeout: 60000 });
    desktop.process().stderr.on('data', chunk => fs.appendFileSync(path.join(root, 'main.log'), chunk));
    const identity = await desktop.evaluate(({ app, BrowserWindow }) => ({
        name: app.getName(), profile: app.getPath('userData'),
        visible: BrowserWindow.getAllWindows().some(window => window.isVisible()),
    }));
    if (identity.name !== 'Folia DualScreen' || path.resolve(identity.profile) !== path.resolve(profile) || identity.visible) {
        throw new Error('Community identity, profile isolation or invisible-window guard failed.');
    }
    const settings = await desktop.evaluate(async ({ app, BrowserWindow }) => {
        await app.whenReady();
        let lastError = 'main window not found';
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const window = BrowserWindow.getAllWindows().find(win => !win.isDestroyed()
                && /^http:\/\/localhost:3000\/(?:\?|$)/.test(win.webContents.getURL()));
            if (window && !window.webContents.isLoadingMainFrame()) {
                try {
                    return await window.webContents.executeJavaScript(`(async () => {
                        if (!window.electron?.getSettings) throw new Error('Preload not ready');
                        const s = await window.electron.getSettings();
                        const displays = await window.electron.getWallpaperDisplays();
                        return { updateChannel: s.UPDATE_CHANNEL, wallpaper: s.wallpaper_mode,
                            displayKeys: Object.keys(displays) };
                    })()`);
                } catch (error) { lastError = String(error); }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('Hidden Electron preload/settings did not become ready: ' + lastError);
    });
    if (settings.updateChannel !== 'internal' || settings.wallpaper === true) {
        throw new Error('Preview update isolation or clean-profile wallpaper guard failed.');
    }
    const result = { identity, settings, result: 'passed' };
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} finally {
    await desktop?.close().catch(() => {});
    vite.kill();
    fs.closeSync(log);
}
