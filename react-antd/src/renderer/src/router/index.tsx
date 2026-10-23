/* Hash 路由：兼容 Electron file:// 入口。 */
import { createHashRouter, Navigate } from 'react-router-dom'
import App from '@renderer/App'
import ChatPage from '@renderer/modules/chat/pages'
import SettingsPage from '@renderer/modules/settings/pages'
import PluginPage from '@renderer/modules/plugin/pages'
const router = createHashRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <ChatPage /> },
      { path: '/settings', element: <SettingsPage /> },
      /* 插件板块：MCP插件 / SKILL技能（React Router 不支持参数正则，按两条静态路径声明） */
      { path: '/plugin/mcp', element: <PluginPage /> },
      { path: '/plugin/skill', element: <PluginPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
export default router
