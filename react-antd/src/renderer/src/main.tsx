/* React 渲染入口：业务状态由 Zustand 持有，IPC 仅使用 preload 白名单。 */
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import 'antd/dist/reset.css'
import './styles/index.scss'
import router from './router'
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
