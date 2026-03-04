import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { mkdir } from 'fs/promises'
import { registerSettingsHandlers } from './handlers/settings-handler'
import { registerFileHandlers } from './handlers/files-handler'
import { registerAgentHandlers } from './handlers/agent-handler'
import { registerSessionHandlers } from './handlers/session-handler'

import { SystemPromptManager } from './managers/system-prompt-manager'
import { SettingsManager } from './managers/settings-manager'
import { SessionManager } from './managers/session-manager'
import { WORKSPACE_PATH } from './configs'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Create .catbot/workspace directory
  try {
    await mkdir(WORKSPACE_PATH, { recursive: true })

    const systemPromptManager = new SystemPromptManager(WORKSPACE_PATH)
    const settingsManager = new SettingsManager(WORKSPACE_PATH)
    const sessionManager = new SessionManager(WORKSPACE_PATH)

    // Initialize managers (creates default files if needed)
    await systemPromptManager.init()
    await settingsManager.init()
    await sessionManager.init()

    // IPC Handlers for config files
    registerSettingsHandlers(systemPromptManager, settingsManager)

    // IPC Handlers for Session
    registerSessionHandlers(sessionManager)

    // IPC Handlers for Workspace
    registerFileHandlers(WORKSPACE_PATH)

    // IPC Handler for Agent Loop
    registerAgentHandlers({
      workspacePath: WORKSPACE_PATH,
      systemPromptManager,
      settingsManager,
      sessionManager
    })
  } catch (err) {
    console.error('Failed to initialize workspace:', err)
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
