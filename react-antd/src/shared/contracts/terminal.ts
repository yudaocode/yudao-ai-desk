/*
 * 终端域跨进程契约：PTY 实例创建入参、实例信息与流事件。
 */

/* 终端创建入参：cwd 为工作目录（通常为项目目录），缺省回退用户主目录 */
export interface TerminalCreateInput {
  /* 工作目录 */
  cwd?: string
  /* 终端列数 */
  cols?: number
  /* 终端行数 */
  rows?: number
}

/* 终端实例信息 */
export interface TerminalDTO {
  /* 终端实例 ID */
  id: string
  /* 工作目录 */
  cwd: string
  /* 使用的 shell */
  shell: string
}

/* 终端流事件（主 → 渲染）：data 为输出片段，exit 为进程退出 */
export interface TerminalEvent {
  /* 终端实例 ID */
  id: string
  /* 事件类型：data 输出 / exit 退出 */
  type: 'data' | 'exit'
  /* 输出片段（data） */
  data?: string
  /* 退出码（exit） */
  exitCode?: number
}
