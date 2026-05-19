const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const TARGET_URL = 'https://www.google.com/ai';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Use OpenGL via ANGLE instead of Vulkan — avoids Mesa/ZINK driver errors on Intel iGPUs
app.commandLine.appendSwitch('use-angle', 'gl');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// Cap V8 heap to prevent memory creep over long sessions
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

const AUTH_DOMAINS = [
  'google.com',
  'googleapis.com',
  'accounts.google.com',
  'gstatic.com',
];

function isAuthDomain(hostname) {
  return AUTH_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Google AI',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      partition: 'persist:google-ai',
    },
  });

  mainWindow.loadURL(TARGET_URL, { userAgent: USER_AGENT });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (isAuthDomain(u.hostname)) return { action: 'allow' };
    } catch { /* ignore */ }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      if (isAuthDomain(u.hostname)) return;
      event.preventDefault();
      shell.openExternal(url);
    } catch { /* ignore */ }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const googleSes = session.fromPartition('persist:google-ai');
  googleSes.setUserAgent(USER_AGENT);

  googleSes.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['Sec-CH-UA']          = '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"';
    h['Sec-CH-UA-Mobile']   = '?0';
    h['Sec-CH-UA-Platform'] = '"Linux"';
    callback({ requestHeaders: h });
  });

  createWindow();

  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
