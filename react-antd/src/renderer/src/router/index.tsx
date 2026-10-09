/* Hash 路由：兼容 Electron file:// 入口。 */
import { createHashRouter, Navigate } from 'react-router-dom'
import App from '../App'
import ChatPage from '../modules/chat/pages'
import SettingsPage from '../modules/settings/pages'
const router = createHashRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <ChatPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
export default router
