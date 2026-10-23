<script setup lang="ts">
/*
* 左侧常驻图标栏（活动栏）：首页 / 插件 / 底部系统设置，切换一级板块
* @author xuxueli 2026-10-18
*/
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLayoutStore } from '@renderer/stores/layout'
import { SECTION_ENTRY, sectionOfPath, type SectionKey } from '@renderer/config/nav'
import { t } from '@renderer/i18n'

const route = useRoute()
const router = useRouter()
const layout = useLayoutStore()

/* 当前所属板块（高亮对应入口） */
const section = computed(() => sectionOfPath(route.path))

/* 切换板块：展开子菜单栏并跳转到板块入口 */
function go(key: SectionKey): void {
  layout.expandSidebar()
  if (section.value !== key) {
    router.push(SECTION_ENTRY[key])
  }
}
</script>

<template>
  <nav class="sidebar-rail">
    <div class="rail-group">
      <button
        class="rail-btn"
        :class="{ active: section === 'home' }"
        :title="t('layout.home')"
        @click="go('home')"
      >
        <span class="ui-icon"><HomeFilled /></span>
      </button>
      <button
        class="rail-btn"
        :class="{ active: section === 'plugin' }"
        :title="t('plugin.title')"
        @click="go('plugin')"
      >
        <!-- 插件：带插头的图标 -->
        <svg class="desk-svg-icon rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
      </button>
    </div>
    <div class="rail-group">
      <button
        class="rail-btn"
        :class="{ active: section === 'settings' }"
        :title="t('settings.title')"
        @click="go('settings')"
      >
        <span class="ui-icon"><Setting /></span>
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
/* 常驻图标栏：固定宽度，与顶部栏同色（最深） */
.sidebar-rail {
  flex-shrink: 0;
  width: var(--desk-rail-width);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0 8px;
  background: var(--desk-chrome-bg);
}

.rail-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.rail-btn {
  width: 38px;
  height: 38px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.rail-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.rail-btn.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.rail-icon {
  width: 18px;
  height: 18px;
}
</style>
