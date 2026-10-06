const { app, BrowserWindow, ipcMain, Menu, globalShortcut, screen } = require('electron');
const koffi = require('koffi');

// ==========================================
// PART 1: STABLE NATIVE STEALTH (macOS)
// ==========================================
app.commandLine.appendSwitch('log-level', '3');
const libobjc = koffi.load('libobjc.dylib');
const sel_registerName = libobjc.func('void * sel_registerName(str)');
const objc_msgSend_ptr = libobjc.func('void * objc_msgSend(void *self, void *op)');
const objc_msgSend_void = libobjc.func('void objc_msgSend(void *self, void *op, int arg)');

function applyNativeHudLogic(browserWindow) {
    try {
        const viewHandleBuffer = browserWindow.getNativeWindowHandle();
        const viewHandle = viewHandleBuffer.readBigInt64LE(0);
        const realWindowHandle = objc_msgSend_ptr(viewHandle, sel_registerName("window"));
        if (!realWindowHandle) return;

        objc_msgSend_void(realWindowHandle, sel_registerName("setLevel:"), 3); 
        objc_msgSend_void(realWindowHandle, sel_registerName("setSharingType:"), 0);
        
        const behavior = (1 << 13) | (1 << 0);
        objc_msgSend_void(realWindowHandle, sel_registerName("setCollectionBehavior:"), behavior);
        console.log("✅ Native Stealth Applied");
    } catch (e) { console.error("❌ Native Hack Failed:", e); }
}

// ==========================================
// PART 2: UI INJECTION (Renderer)
// ==========================================
const INJECTED_UI_SCRIPT = `
    (() => {
        if (window.hasCluelyInjected) return;
        window.hasCluelyInjected = true;
        const { ipcRenderer } = require('electron');

        const cursorStyle = document.createElement('style');
        cursorStyle.id = 'cluely-cursor-manager';
        cursorStyle.innerHTML = 'html, body, * { cursor: inherit !important; }';
        document.head.appendChild(cursorStyle);

        ipcRenderer.on('update-cursor', (event, type) => {
            cursorStyle.innerHTML = \`
                html, body, #cluely-wrapper, * { cursor: \${type} !important; }
                .cluely-ctrl-btn { cursor: pointer !important; }
            \`;
        });

        // --- 2D AUTO-SCROLL ENGINE ---
        let autoScrollInterval = null;
        ipcRenderer.on('auto-scroll', (e, dirX, dirY) => {
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
            if (dirX === 0 && dirY === 0) return;

            const getScrollContainer = () => {
                const chatArea = document.querySelector('main');
                if (chatArea) {
                    let curr = chatArea;
                    while (curr && curr !== document.body) {
                        const style = window.getComputedStyle(curr);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                            style.overflowX === 'auto' || style.overflowX === 'scroll') {
                            return curr;
                        }
                        curr = curr.parentElement;
                    }
                }
                return document.scrollingElement || document.body;
            };

            const scroller = getScrollContainer();
            autoScrollInterval = setInterval(() => {
                if (dirY !== 0) scroller.scrollTop += (dirY * 2);
                if (dirX !== 0) scroller.scrollLeft += (dirX * 2);
            }, 16);
        });

        const baseStyle = document.createElement('style');
        baseStyle.innerHTML = \`
            html, body { background: transparent !important; margin: 0; padding: 0; overflow: hidden; }
            #cluely-wrapper { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483647; }
            #cluely-sidebar { 
                position: fixed; top: 0; left: 0; bottom: 0; width: 32px; 
                background: rgba(26, 26, 26, 0.95); border-right: 1px solid #333; 
                display: flex; flex-direction: column; align-items: center; 
                pointer-events: auto; padding: 10px 0; transition: all 0.2s;
            }
            body.is-interactive #cluely-sidebar { border-right: 2px solid #007aff; box-shadow: 2px 0 10px rgba(0,122,255,0.3); }
            .cluely-ctrl-btn { width: 24px; height: 24px; color: #999; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
            .cluely-ctrl-btn:hover { color: white; }
            #cluely-drag-spacer { flex-grow: 1; width: 100%; -webkit-app-region: drag; }
            body { padding-left: 32px !important; }
        \`;
        document.head.appendChild(baseStyle);

        const wrapper = document.createElement('div');
        wrapper.id = 'cluely-wrapper';
        wrapper.innerHTML = \`
            <div id="cluely-sidebar">
                <div id="btn-reload" class="cluely-ctrl-btn">⟳</div>
                <div id="cluely-drag-spacer"></div>
                <div id="btn-minimize" class="cluely-ctrl-btn">⏏</div>
            </div>\`;
        document.body.appendChild(wrapper);

        document.getElementById('btn-reload').onclick = () => window.location.reload();
        document.getElementById('btn-minimize').onclick = () => ipcRenderer.send('toggle-drawer');
        ipcRenderer.on('mode-changed', (e, isInter) => document.body.classList.toggle('is-interactive', isInter));
    })();
`;

// ==========================================
// PART 3: MAIN PROCESS
// ==========================================
let mainWindow;
let isInteractive = false;
let isHidden = false; 
let cursorIndex = 0;
let sizeIndex = 0;
let scrollDirY = 0;
let scrollDirX = 0;
let savedBounds = null; 

const TOGGLE_SIZES = [
    { width: 450, height: 550 }, 
    { width: 450, height: 600 },
    { width: 550, height: 600 },
    { width: 550, height: 350 }
];

function toggleDrawerLogic() {
    const currentBounds = mainWindow.getBounds();
    const currentDisplay = screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y });
    const screenRightEdge = currentDisplay.bounds.x + currentDisplay.bounds.width;

    if (isHidden) {
        if (savedBounds) mainWindow.setBounds(savedBounds);
        else mainWindow.setPosition(screenRightEdge - currentBounds.width, currentBounds.y);
        isHidden = false;
    } else {
        savedBounds = currentBounds;
        mainWindow.setPosition(screenRightEdge - 32, currentBounds.y);
        isHidden = true;
    }
}

function moveWindow(dx, dy) {
    if (isHidden) return;
    const bounds = mainWindow.getBounds();
    mainWindow.setPosition(bounds.x + dx, bounds.y + dy);
}

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: TOGGLE_SIZES[0].width,    
        height: TOGGLE_SIZES[0].height,  
        frame: false, alwaysOnTop: true, skipTaskbar: true,
        focusable: true, type: 'panel',
        transparent: false,
        backgroundColor: '#1E1E1E',
        hasShadow: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            colorSpace: 'srgb'
        }
    });

    mainWindow.webContents.setMaxListeners(20);
    mainWindow.loadURL('https://chatgpt.com');
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    //mainWindow.webContents.openDevTools({ mode: 'detach' });

    // --- 1. INTERACTION TOGGLE (Alt+Z) ---
    globalShortcut.register('Alt+Z', () => {
        isInteractive = !isInteractive;
        mainWindow.setIgnoreMouseEvents(!isInteractive, isInteractive ? undefined : { forward: true });
        mainWindow.webContents.send('mode-changed', isInteractive);
    });

    // --- 2. DRAWER TOGGLE (Alt+X) ---
    globalShortcut.register('Alt+X', () => toggleDrawerLogic());

    // --- 3. SIZE CYCLE (Alt+V) ---
    globalShortcut.register('Alt+V', () => {
        if (isHidden) return; 
        sizeIndex = (sizeIndex + 1) % TOGGLE_SIZES.length;
        mainWindow.setSize(TOGGLE_SIZES[sizeIndex].width, TOGGLE_SIZES[sizeIndex].height);
    });

    // --- 4. FOCUS CHAT AREA (Alt+F) ---
    // --- 4. FOCUS CHAT AREA (Alt+F) ---
    globalShortcut.register('Alt+F', () => {
        // Force the app to the front so it can accept keystrokes
        mainWindow.show();
        mainWindow.focus();

        // Ensure we aren't in "click-through" mode
        if (!isInteractive) {
            isInteractive = true;
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.webContents.send('mode-changed', true);
        }

        mainWindow.webContents.executeJavaScript(`
            (() => {
                const el = document.getElementById('prompt-textarea');
                if (el) {
                    // 1. Simulate a real user click to wake up ProseMirror
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    el.click();

                    // 2. Apply focus
                    el.focus();

                    // 3. Force cursor to the end
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    
                    console.log("🎯 Focus forced to ChatGPT prompt");
                } else {
                    console.error("❌ Could not find #prompt-textarea");
                }
            })();
        `);
    });

    // --- 5. CURSOR CYCLE (Alt+C) ---
    globalShortcut.register('Alt+C', () => {
        const modes = ['default', 'text', 'none'];
        cursorIndex = (cursorIndex + 1) % modes.length;
        mainWindow.webContents.send('update-cursor', modes[cursorIndex]);
    });

    // --- 6. INNER AUTO-SCROLL (Alt + Arrows) ---
    globalShortcut.register('Alt+Down', () => {
        scrollDirY = (scrollDirY === 1) ? 0 : 1; scrollDirX = 0;
        mainWindow.webContents.send('auto-scroll', scrollDirX, scrollDirY);
    });
    globalShortcut.register('Alt+Up', () => {
        scrollDirY = (scrollDirY === -1) ? 0 : -1; scrollDirX = 0;
        mainWindow.webContents.send('auto-scroll', scrollDirX, scrollDirY);
    });
    globalShortcut.register('Alt+Right', () => {
        scrollDirX = (scrollDirX === 1) ? 0 : 1; scrollDirY = 0;
        mainWindow.webContents.send('auto-scroll', scrollDirX, scrollDirY);
    });
    globalShortcut.register('Alt+Left', () => {
        scrollDirX = (scrollDirX === -1) ? 0 : -1; scrollDirY = 0;
        mainWindow.webContents.send('auto-scroll', scrollDirX, scrollDirY);
    });

    // --- 7. WINDOW MOVEMENT (Cmd/Ctrl + Alt + Arrows) ---
    const step = 40;
    globalShortcut.register('CmdOrCtrl+Alt+Up', () => moveWindow(0, -step));
    globalShortcut.register('CmdOrCtrl+Alt+Down', () => moveWindow(0, step));
    globalShortcut.register('CmdOrCtrl+Alt+Left', () => moveWindow(-step, 0));
    globalShortcut.register('CmdOrCtrl+Alt+Right', () => moveWindow(step, 0));

    // --- 8. CHATGPT ACTIONS ---
    globalShortcut.register('Alt+A', () => mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Dictate button\"]')?.click();"));
    globalShortcut.register('Alt+S', () => mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Submit dictation\"]')?.click();"));
    globalShortcut.register('Alt+D', () => mainWindow.webContents.executeJavaScript("document.querySelector('button[data-testid=\"send-button\"]')?.click();"));
    globalShortcut.register('Alt+R', () => mainWindow.reload());

    ipcMain.on('toggle-drawer', () => toggleDrawerLogic());

    mainWindow.webContents.on('did-finish-load', () => {
        applyNativeHudLogic(mainWindow);
        mainWindow.webContents.executeJavaScript(INJECTED_UI_SCRIPT);
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});