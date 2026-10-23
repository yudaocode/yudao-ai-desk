<script setup lang="ts">
/*
* 左侧栏外壳：常驻图标栏 + 子菜单栏（首页 / 插件 / 系统设置 按板块切换）
* @author xuxueli 2026-10-18
*/
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActivityRail from '@renderer/components/ActivityRail.vue'
import SubmenuMenu from '@renderer/components/SubmenuMenu.vue'
import SidebarHomePanel from '@renderer/modules/chat/components/SidebarHomePanel.vue'
import { useLayoutStore } from '@renderer/stores/layout'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePanelResize } from '@renderer/composables/usePanelResize'
import { NAV_SECTIONS, pluginItemKey, sectionOfPath, type NavItem } from '@renderer/config/nav'
import { t } from '@renderer/i18n'

const route = useRoute()
const router = useRouter()
const layout = useLayoutStore()
const settings = useSettingsStore()

/* 当前所属板块 */
const section = computed(() => sectionOfPath(route.path))

/* 非首页板块的子菜单定义（插件 / 系统设置）；首页为自定义面板 */
const submenu = computed(() => (section.value === 'home' ? null : NAV_SECTIONS[section.value]))

/* 当前子菜单选中项：插件按路由、系统设置按设置分类 */
const activeKey = computed(() =>
  section.value === 'plugin' ? pluginItemKey(route.path) : settings.activeTab
)

/* 拖拽右边缘调整子菜单栏宽度（统一复用 usePanelResize） */
const { startResize } = usePanelResize({
  getWidth: () => layout.panelWidth,
  setWidth: layout.setPanelWidth,
  edge: 'left'
})

/* 双击拖拽手柄：恢复子菜单栏默认宽度 */
function resetPanelWidth(): void {
  layout.resetPanelWidth()
}

/* 子菜单项点击：插件跳路由；系统设置切分类并进入设置页 */
function onSubmenuSelect(item: NavItem): void {
  if (item.tab) {
    settings.activeTab = item.tab
    if (route.path !== NAV_SECTIONS.settings.entryPath) {
      router.push(NAV_SECTIONS.settings.entryPath)
    }
    return
  }
  if (item.path && route.path !== item.path) {
    router.push(item.path)
  }
}
</script>

<template>
  <aside
    class="desk-sidebar"
    :class="{ collapsed: layout.sidebarCollapsed }"
    :style="{
      width: layout.sidebarCollapsed
        ? 'var(--desk-rail-width)'
        : `calc(var(--desk-rail-width) + ${layout.panelWidth}px)`
    }"
  >
    <ActivityRail />

    <!-- 子菜单栏：折叠时隐藏，仅保留左侧图标栏 -->
    <div v-show="!layout.sidebarCollapsed" class="sidebar-panel">
      <!-- 右边缘拖拽手柄：拖拽调整面板宽度，双击恢复默认宽度 -->
      <div
        class="sidebar-resizer"
        :title="t('layout.resetPanelWidth')"
        @mousedown="startResize"
        @dblclick="resetPanelWidth"
      ></div>

      <SidebarHomePanel v-if="!submenu" />
      <SubmenuMenu
        v-else
        :title-key="submenu.titleKey"
        :items="submenu.items"
        :active-key="activeKey"
        :bold="section === 'plugin'"
        @select="onSubmenuSelect"
      />
    </div>
  </aside>
</template>

<style scoped lang="scss">
/* 列表面板：图标栏右侧，折叠时隐藏；与右侧正文之间保留间隔线 */
.sidebar-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--desk-border);
}

/* 右边缘拖拽手柄：调整面板宽度 */
.sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  -webkit-app-region: no-drag;
}

.sidebar-resizer:hover,
body.resizing .sidebar-resizer {
  background: var(--desk-primary-soft);
}
</style>
