/*
* 渲染进程入口：注册 Pinia/路由/i18n/ant dv next 与全局图标后挂载应用
* */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'antdv-next'
import {
  DownOutlined as ArrowDown,
  LeftOutlined as ArrowLeft,
  RightOutlined as ArrowRight,
  CalendarOutlined as Calendar,
  CaretDownOutlined as CaretBottom,
  CaretRightOutlined as CaretRight,
  CommentOutlined as ChatDotRound,
  MessageOutlined as ChatLineRound,
  CheckOutlined as Check,
  CheckCircleOutlined as CircleCheck,
  CloseCircleOutlined as CircleClose,
  ClockCircleOutlined as Clock,
  CloseOutlined as Close,
  ApiOutlined as Connection,
  CopyOutlined as CopyDocument,
  RobotOutlined as Cpu,
  DeleteOutlined as Delete,
  FileTextOutlined as Document,
  FileAddOutlined as DocumentAdd,
  EditOutlined as Edit,
  FormOutlined as EditPen,
  MenuUnfoldOutlined as Expand,
  CheckOutlined as Finished,
  MenuFoldOutlined as Fold,
  FolderOutlined as Folder,
  FolderOpenOutlined as FolderOpened,
  FullscreenOutlined as FullScreen,
  HomeFilled,
  InfoCircleFilled as InfoFilled,
  LoadingOutlined as Loading,
  ThunderboltOutlined as MagicStick,
  DesktopOutlined as Monitor,
  MoreOutlined as MoreFilled,
  PlusOutlined as Plus,
  SendOutlined as Promotion,
  ReadOutlined as Reading,
  ReloadOutlined as Refresh,
  SearchOutlined as Search,
  SettingOutlined as Setting,
  FullscreenExitOutlined as ScaleToOriginal,
  ToolOutlined as Tools,
  ExportOutlined as TopRight,
  UserOutlined as User,
  PauseOutlined as VideoPause,
  WarningFilled
} from '@antdv-next/icons'
import 'antdv-next/dist/reset.css'
import 'antdv-next/global'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './styles/index.scss'

/* 渲染进程入口 */
const app = createApp(App)

/* 按需注册图标（避免全量引入整套图标，减小打包体积） */
const icons = {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CaretBottom,
  CaretRight,
  ChatDotRound,
  ChatLineRound,
  Check,
  CircleCheck,
  CircleClose,
  Clock,
  Close,
  Connection,
  CopyDocument,
  Cpu,
  Delete,
  Document,
  DocumentAdd,
  Edit,
  EditPen,
  Expand,
  Finished,
  Fold,
  Folder,
  FolderOpened,
  FullScreen,
  HomeFilled,
  InfoFilled,
  Loading,
  MagicStick,
  Monitor,
  MoreFilled,
  Plus,
  Promotion,
  Reading,
  Refresh,
  Search,
  Setting,
  ScaleToOriginal,
  Tools,
  TopRight,
  User,
  VideoPause,
  WarningFilled
}
for (const [name, component] of Object.entries(icons)) {
  app.component(name, component)
}

/* 装配全局插件：状态管理、路由、国际化与 ant dv next 组件库 */
app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(Antd)
app.mount('#app')
