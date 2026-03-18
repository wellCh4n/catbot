import { ipcMain } from 'electron'
import { ChannelManager } from '../managers/channel-manager'

export function registerChannelHandlers(channelManager: ChannelManager): void {
  ipcMain.handle('channel:get-config', async () => {
    return await channelManager.getChannelConfig()
  })

  ipcMain.handle('channel:get-by-id', async (_, channelId: string) => {
    return await channelManager.getChannel(channelId)
  })

  ipcMain.handle('channel:update-by-id', async (_, { channelId, config }) => {
    const current = await channelManager.getChannelConfig()
    await channelManager.updateChannelConfig({ ...current, [channelId]: config })
    return { success: true }
  })
}
