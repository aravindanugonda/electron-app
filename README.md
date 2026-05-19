# Desktop App Wrappers for AI Chat Services

Unofficial Electron-based desktop wrappers for [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), and [Google AI](https://gemini.google.com).

OpenAI, Anthropic, and Google do not ship native Linux desktop apps — these services are web-only. This repo wraps each service's website in an Electron shell and packages it as a `.deb` installer for Linux (Chromebook / Debian / Ubuntu), so they behave like first-class desktop applications.

```
.
├── chatgpt/    Electron wrapper for chatgpt.com
├── claude/     Electron wrapper for claude.ai
└── google-ai/  Electron wrapper for Google AI (Gemini)
```

---

## Why this exists

- **Dedicated window** — each app runs in its own window, separate from your browser, and appears as its own entry in your taskbar/dock
- **Persistent login** — sessions are stored in isolated per-app partitions (`persist:chatgpt`, `persist:claude`, `persist:google-ai`), so you stay logged in across reboots without touching your browser profile
- **Native OS integration** — apps show up in launchers, can be pinned, get their own icons, and behave like installed desktop apps
- **Clean external link handling** — links outside the app's own domain open in the system browser instead of navigating away inside the window
- **Bot detection bypass** — each app spoofs `User-Agent`, `Sec-CH-UA` headers, and `navigator.userAgentData` so the sites don't detect they're running inside a WebView and restrict functionality

---

## Prereqs (all apps)

- Node 20+ — if your default is Node 18, activate v20 first:

```bash
export PATH="$HOME/.config/nvm/versions/node/v20.20.2/bin:$PATH"
node -v   # v20.x
```

- `npm install` must be run inside each app's directory before building.

---

## ChatGPT

```bash
cd chatgpt
npm install
npm start           # run in dev
npm run dist:deb    # build → dist/chatgpt-desktop_*.deb
```

Install: `sudo dpkg -i dist/chatgpt-desktop_1.0.0_amd64.deb`

---

## Claude

```bash
cd claude
npm install
npm start           # run in dev
npm run dist:deb    # build → dist/claude-desktop_*.deb
```

Install: `sudo dpkg -i dist/claude-desktop_1.0.0_amd64.deb`

---

## Google AI

```bash
cd google-ai
npm install
npm start           # run in dev
npm run dist:deb    # build → dist/google-ai-desktop_*.deb
```

Install: `sudo dpkg -i dist/google-ai-desktop_1.0.0_amd64.deb`

---

## Google sign-in

Google's OAuth policy **explicitly blocks sign-in from embedded WebViews** as a phishing countermeasure — this affects all three apps since they all offer "Continue with Google." No framework (Electron, Tauri, NeutralinoJS) can bypass this policy.

**Workaround:** use email + password instead of "Continue with Google."  
If your account was created via Google SSO, add a password first:
- ChatGPT: [auth.openai.com](https://auth.openai.com)
- Claude: account settings at [claude.ai](https://claude.ai)
- Google AI: use your Google account password directly at sign-in

---

## Notes

- Uninstalling an app removes its stored session data.
- Unofficial wrappers — not affiliated with OpenAI, Anthropic, or Google. Respect each service's Terms of Service.
