/*
 * 系统外壳域跨进程契约：可用「打开方式」应用。
 */

/* 可用「打开方式」应用（由主进程探测本机常见编辑器，供下拉选择） */
export interface OpenWithApp {
  /* 应用显示名 */
  name: string
  /* 应用可执行文件路径 */
  path: string
}
