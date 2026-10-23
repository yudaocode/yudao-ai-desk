<script setup lang="ts">
/*
* 顶栏对话操作：底部终端 / 右侧侧栏（侧边任务）显隐开关
* @author xuxueli 2026-10-18
*/
import { useLayoutStore } from '@renderer/stores/layout'
import { t } from '@renderer/i18n'

const layout = useLayoutStore()
</script>

<template>
  <button
    class="sidebar-toggle"
    :class="{ active: layout.terminalVisible }"
    :title="layout.terminalVisible ? t('chat.hideTerminal') : t('chat.showTerminal')"
    @click="layout.toggleTerminal"
  >
    <svg class="desk-svg-icon panel-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M7.5 10l2.5 2.5-2.5 2.5" />
      <path d="M12.5 15H17" />
    </svg>
  </button>
  <button
    class="sidebar-toggle"
    :class="{ active: layout.rightPanelVisible }"
    :title="layout.rightPanelVisible ? t('chat.hideSidePanel') : t('chat.showSidePanel')"
    @click="layout.toggleRightPanel"
  >
    <svg class="desk-svg-icon panel-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
/* 面板开关激活态：高亮当前已展开的面板 */
.sidebar-toggle.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

/* 面板图标尺寸 */
.panel-icon {
  width: 16px;
  height: 16px;
}
</style>
