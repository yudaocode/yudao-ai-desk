# Yudao AI Desk · React

React + TypeScript + Ant Design + Zustand

此目录可独立安装、开发和打包；产品介绍与截图见 [项目 README](../README.md)。

Node.js 最低 22.12，推荐 24。

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run pack
```

`pack` 生成本地应用目录。使用 `npm run build:mac`、`npm run build:win` 生成对应平台安装包，产物位于 `release/`。

## 客户端更新

通过 `YUDAO_AI_DESK_RELEASE_REPO=owner/repository` 配置 GitHub Releases 仓库。安装包名称需包含 `react-antd`，用于识别当前版本的发布资产。
