/*
 * 对话域跨进程契约：流式事件与越界审批。
 */

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  /* 所属会话主键 */
  sessionId: string
  /* 事件类型：delta 增量文本 / thinking 思考 / tool_start 工具开始 / tool_end 工具结束 / error 错误 / done 完成 / aborted 中止 */
  type: 'delta' | 'thinking' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'aborted'
  /* 增量文本（delta / thinking） */
  text?: string
  /* 工具名（tool_start / tool_end） */
  toolName?: string
  /* 工具调用 ID（tool_start / tool_end） */
  toolCallId?: string
  /* 工具调用入参（tool_start） */
  args?: unknown
  /* 工具返回文本（tool_end） */
  result?: string
  /* 工具是否失败（tool_end） */
  isError?: boolean
  /* 错误信息（error） */
  message?: string
}

/* 越界审批选择：允许本次 / 本会话允许 / 拒绝 */
export type ChatApprovalChoice = 'once' | 'session' | 'deny'

/* 越界审批请求（主进程 → 渲染进程，由渲染进程弹应用内对话框） */
export interface ChatApprovalPrompt {
  /* 审批请求 ID（回传选择时对应） */
  requestId: string
  /* 触发审批的工具名 */
  tool: string
  /* 动作类型：read 读 / write 写 */
  action: 'read' | 'write'
  /* 越界目标的绝对路径 */
  abs: string
  /* 沙箱根目录（通常为项目目录） */
  root: string
}
