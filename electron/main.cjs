// Electron shell for the AP Trainer.
//
// The web app is served from a privileged custom scheme (app://trainer/…) rather than file://,
// because fetch() of the samples and ES-module loading need a real origin. The stable origin
// also keeps IndexedDB (settings + results) persistent in the userData directory.

const { app, BrowserWindow, protocol, shell, Menu, net, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Results live in IndexedDB under userData, keyed by the app:// origin below. Both are pinned
// so that rebuilt AppImages (or a renamed package/productName) keep finding the same data.
// Never change USER_DATA_DIR, SCHEME or HOST without migrating the data.
const USER_DATA_DIR = 'absolute-pitch-trainer';
app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIR));

const SCHEME = 'app';
const HOST = 'trainer';
const ROOT = app.getAppPath();
const START = `${SCHEME}://${HOST}/index.html${process.env.AP_QUICK ? '?quick' : ''}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon',
};

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
}]);

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    // stay inside the app directory; never serve build caches or VCS data
    if (!file.startsWith(ROOT + path.sep) || /[\\/]\.(cache|git)([\\/]|$)/.test(file)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      if (!(await fs.promises.stat(file)).isFile()) throw new Error('not a file');
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    return new Response(res.body, {
      status: 200,
      headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' },
    });
  });
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'AP Trainer',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121211' : '#f6f5f2', // matches --bg in styles.css
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep trial timing accurate if the window loses focus
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  // external links → system browser; no other windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(START);
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'App', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    registerProtocol();
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
