import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { mkdir } from 'fs/promises'
import { registerSettingsHandlers } from './handlers/settings-handler'
import { registerFileHandlers } from './handlers/files-handler'
import { registerAgentHandlers } from './handlers/agent-handler'
import { registerSessionHandlers } from './handlers/session-handler'
import { registerPromptHandlers } from './handlers/prompt-handler'
import { registerSkillsHandlers } from './handlers/skills-handler'
import { registerChannelHandlers } from './handlers/channel-handler'

import { PromptManager } from './managers/prompt-manager'
import { SettingsManager } from './managers/settings-manager'
import { SessionManager } from './managers/session-manager'
import { SkillsManager } from './managers/skills-manager'
import { ChannelManager } from './managers/channel-manager'
import { AgentManager } from './managers/agent-manager'
import { WORKSPACE_PATH } from './configs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixPath = require('fix-path').default
fixPath()

let channelManager: ChannelManager | undefined

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'CatBot',
    titleBarStyle: 'hiddenInset',
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

  mainWindow.webContents.on('context-menu', (_event, params) => {
    // Only show edit menu for editable fields or selected text
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim())
    if (!params.isEditable && !hasSelection) return

    const template: MenuItemConstructorOptions[] = [
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    ]
    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: mainWindow })
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

    const promptManager = new PromptManager()
    const settingsManager = new SettingsManager()
    const sessionManager = new SessionManager()
    const skillsManager = new SkillsManager()
    channelManager = new ChannelManager(settingsManager)

    // Initialize managers (creates default files if needed)
    await promptManager.init()
    await settingsManager.init()
    await sessionManager.init()
    await skillsManager.init()

    const agentManager = new AgentManager({
      promptManager,
      settingsManager,
      sessionManager
    })

    // Set AgentManager for ChannelManager
    channelManager.setAgentManager(agentManager)

    // IPC Handlers for config files
    registerPromptHandlers(promptManager)
    registerSettingsHandlers(settingsManager)
    registerChannelHandlers(channelManager)

    // IPC Handlers for Session
    registerSessionHandlers(sessionManager)

    // IPC Handlers for Workspace
    registerFileHandlers()

    // IPC Handlers for Skills
    registerSkillsHandlers(skillsManager)

    // IPC Handler for Agent Loop
    registerAgentHandlers(agentManager)

    // Start Channels
    await channelManager.init()
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
  if (channelManager) {
    channelManager.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
