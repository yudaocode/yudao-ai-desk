<script setup lang="ts">
/*
* 插件模块：MCP插件 / SKILL技能 的正文区（功能建设中占位）
* @author xuxueli 2026-10-18
*/
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@renderer/i18n'

const route = useRoute()

/* 当前插件子菜单标题：按路由区分 MCP插件 / SKILL技能 */
const title = computed(() =>
  route.path.endsWith('/skill') ? t('plugin.skill') : t('plugin.mcp')
)
</script>

<template>
  <div class="plugin-page">
    <div class="plugin-placeholder">
      <div class="plugin-name">{{ title }}</div>
      <div class="plugin-wip">{{ t('plugin.wip') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--desk-bg);
}

.plugin-placeholder {
  text-align: center;
}

.plugin-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--desk-text);
}

.plugin-wip {
  margin-top: 8px;
  font-size: 14px;
  color: var(--desk-text-tertiary);
}
</style>
