<script setup lang="ts">
/*
* 顶部导航控件：后退 / 前进 / 侧栏折叠，置于各页标题栏左侧固定位置
* @author xuxueli 2026-10-18
*/
import { useRouter } from 'vue-router'
import { useLayoutStore } from '@renderer/stores/layout'
import { useNavHistory } from '@renderer/composables/useNavHistory'
import { t } from '@renderer/i18n'

const router = useRouter()
const layout = useLayoutStore()
/* 能否后退/前进（决定箭头可用态） */
const { canBack, canForward } = useNavHistory()

/* 后退到上一页 */
function goBack(): void {
  if (canBack.value) {
    router.back()
  }
}

/* 前进到下一页 */
function goForward(): void {
  if (canForward.value) {
    router.forward()
  }
}
</script>

<template>
  <div class="nav-controls">
    <button class="sidebar-toggle" :disabled="!canBack" :title="t('layout.back')" @click="goBack">
      <span class="ui-icon"><ArrowLeft /></span>
    </button>
    <button
      class="sidebar-toggle"
      :disabled="!canForward"
      :title="t('layout.forward')"
      @click="goForward"
    >
      <span class="ui-icon"><ArrowRight /></span>
    </button>
    <button
      class="sidebar-toggle"
      :title="layout.sidebarCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')"
      @click="layout.toggleSidebar"
    >
      <!-- 侧栏面板图标：圆角矩形 + 左侧竖线，表示左侧栏的收起/展开 -->
      <svg class="desk-svg-icon panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
        <path d="M9 4.5v15" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* 导航控件组：与标题同排，固定于顶栏左侧 */
.nav-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

/* 侧栏折叠图标尺寸（着色/描边由 .desk-svg-icon 统一提供） */
.panel-toggle-icon {
  width: 17px;
  height: 17px;
}
</style>
