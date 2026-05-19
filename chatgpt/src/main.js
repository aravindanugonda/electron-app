const { app, BrowserWindow, Menu, shell, session, dialog } = require('electron');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_URL = 'https://chatgpt.com/';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Use OpenGL via ANGLE instead of Vulkan — avoids Mesa/ZINK driver errors on Intel iGPUs
app.commandLine.appendSwitch('use-angle', 'gl');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// Cap V8 heap to prevent memory creep over long sessions
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
// Tell Chromium not to advertise automation — removes the main signal Google
// uses to detect embedded WebViews and block sign-in.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Domains that are part of the ChatGPT login flow and must navigate freely
// inside the app rather than being opened in the system browser.
const AUTH_DOMAINS = [
  'chatgpt.com',
  'openai.com',
  'auth0.com',
  'accounts.google.com',
  'google.com',
];

function isAuthDomain(hostname) {
  return AUTH_DOMAINS.some(
    d => hostname === d || hostname.endsWith('.' + d)
  );
}

// ---------------------------------------------------------------------------
// Chrome cookie import — used by "Sign in via Browser"
// ---------------------------------------------------------------------------

// Chrome on Linux encrypts cookie values with AES-128-CBC.
// Key = PBKDF2-SHA1("peanuts", "saltysalt", 1 iteration, 16 bytes).
// IV  = 16 × 0x20 (space character).
// Encrypted blobs are prefixed with "v10" or "v11" (3 bytes).
function decryptLinuxCookie(hexStr) {
  if (!hexStr || hexStr.length < 6) return null;
  const buf = Buffer.from(hexStr, 'hex');
  const prefix = buf.slice(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    // Unencrypted (older Chrome or empty value)
    return buf.toString('utf8') || null;
  }
  try {
    const key = crypto.pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
    const iv = Buffer.alloc(16, 0x20);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Chrome stores time as microseconds since 1601-01-01 (Windows FILETIME).
// Convert to Unix seconds for Electron's session.cookies.set().
function chromeTimeToUnix(chromeUsec) {
  const n = BigInt(chromeUsec);
  if (n === 0n) return undefined; // session cookie — no expiry
  const OFFSET = 11644473600000000n; // microseconds between 1601-01-01 and 1970-01-01
  return Number((n - OFFSET) / 1000000n);
}

const CHROME_DB_CANDIDATES = [
  path.join(os.homedir(), '.config/google-chrome/Default/Cookies'),
  path.join(os.homedir(), '.config/chromium/Default/Cookies'),
  path.join(os.homedir(), '.config/google-chrome-stable/Default/Cookies'),
  path.join(os.homedir(), 'snap/google-chrome/current/.config/google-chrome/Default/Cookies'),
  path.join(os.homedir(), 'snap/chromium/current/.config/chromium/Default/Cookies'),
];

// Returns the number of cookies successfully injected.
async function importChromeCookies(electronSession) {
  // Verify sqlite3 CLI is available
  try {
    execSync('which sqlite3', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'sqlite3 not found. Install it with: sudo apt install sqlite3'
    );
  }

  const dbPath = CHROME_DB_CANDIDATES.find(p => fs.existsSync(p));
  if (!dbPath) {
    throw new Error(
      'Chrome/Chromium cookie database not found.\n' +
      'Checked:\n' + CHROME_DB_CANDIDATES.join('\n')
    );
  }

  // Copy to a temp file — Chrome may have the original file locked.
  const tmpDb = path.join(os.tmpdir(), `chatgpt-cookies-${Date.now()}.db`);
  fs.copyFileSync(dbPath, tmpDb);

  let raw;
  try {
    // Retrieve name, hex-encoded encrypted_value, host_key, path,
    // expires_utc, is_secure, is_httponly for ChatGPT/OpenAI/Auth0 cookies.
    raw = execSync(
      `sqlite3 "${tmpDb}" "SELECT name, hex(encrypted_value), host_key, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%.chatgpt.com' OR host_key = 'chatgpt.com' OR host_key LIKE '%.openai.com' OR host_key = 'openai.com' OR host_key LIKE '%.auth0.com'"`,
      { encoding: 'utf8' }
    );
  } finally {
    try { fs.unlinkSync(tmpDb); } catch { /* ignore */ }
  }

  const rows = raw.trim().split('\n').filter(Boolean);
  let imported = 0;

  for (const row of rows) {
    const parts = row.split('|');
    if (parts.length < 7) continue;
    const [name, hexValue, hostKey, cookiePath, expiresUtc, isSecure, isHttpOnly] = parts;
    const value = decryptLinuxCookie(hexValue);
    if (!value) continue;

    const cookieDef = {
      url: `${isSecure === '1' ? 'https' : 'http'}://${hostKey.replace(/^\./, '')}`,
      name,
      value,
      domain: hostKey,
      path: cookiePath || '/',
      secure: isSecure === '1',
      httpOnly: isHttpOnly === '1',
    };
    const expiry = chromeTimeToUnix(expiresUtc || '0');
    if (expiry !== undefined) cookieDef.expirationDate = expiry;

    try {
      await electronSession.cookies.set(cookieDef);
      imported++;
    } catch { /* skip individual cookie failures */ }
  }

  return imported;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'ChatGPT',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      partition: 'persist:chatgpt',
    },
  });

  mainWindow.loadURL(TARGET_URL, { userAgent: USER_AGENT });

  // Allow chatgpt/openai/auth domains to open popups (OAuth flows use them).
  // Everything else goes to the system browser.
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
      if (isAuthDomain(u.hostname)) return; // allow through
      event.preventDefault();
      shell.openExternal(url);
    } catch { /* ignore */ }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------------------
// Sign in via Browser — opens real Chrome so Google auth succeeds,
// then reads cookies from Chrome's profile and injects them here.
// ---------------------------------------------------------------------------

async function signInViaBrowser() {
  const chatSes = session.fromPartition('persist:chatgpt');

  // Step 1: open chatgpt.com in the system browser
  shell.openExternal('https://chatgpt.com/auth/login');

  // Step 2: tell the user what to do
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Sign in via Browser',
    message: 'Sign in to ChatGPT in the browser window that just opened.',
    detail:
      'Complete the Google sign-in there, then come back here and click\n' +
      '"Import Session" to bring your login into the app.\n\n' +
      'Note: close any other Chrome windows first to avoid a file-lock.',
    buttons: ['Import Session', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) return;

  // Step 3: read + inject cookies
  try {
    const count = await importChromeCookies(chatSes);
    if (count === 0) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'No Cookies Found',
        message:
          'No ChatGPT/OpenAI cookies were found in Chrome.\n\n' +
          'Make sure you completed the sign-in and try again.',
      });
      return;
    }
    // Step 4: reload the app so it picks up the new session
    mainWindow.loadURL(TARGET_URL, { userAgent: USER_AGENT });
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Session Imported',
      message: `Imported ${count} cookie(s). You should now be signed in.`,
    });
  } catch (err) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Import Failed',
      message: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  const chatSes = session.fromPartition('persist:chatgpt');
  chatSes.setUserAgent(USER_AGENT);

  // Sec-CH-UA client-hint headers bypass the User-Agent spoof and reveal
  // "Electron" as a brand unless overridden at the network layer.
  chatSes.webRequest.onBeforeSendHeaders((details, callback) => {
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
        {
          label: 'Sign in via Browser…',
          click: () => signInViaBrowser(),
        },
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
