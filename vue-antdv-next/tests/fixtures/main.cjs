/* 测试入口：隔离应用数据，生产主进程仍从原入口装配。 */
const { app, dialog } = require('electron')
const metadata = require('../../package.json')
/* 裸测试入口没有应用 package 上下文，显式使用当前发行版元数据。 */
app.setName(metadata.name)
app.getVersion = () => metadata.version
const { mkdirSync } = require('fs')
const { resolve } = require('path')
const dataDir = process.env.DESK_TEST_DATA_DIR
if (!dataDir) throw new Error('DESK_TEST_DATA_DIR required')
mkdirSync(dataDir, { recursive: true })
app.setPath('userData', dataDir)
/* 自动化中系统目录选择返回测试目录；项目、数据库、文件与 IPC 均真实运行。 */
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [process.env.DESK_TEST_PROJECT_DIR] })
require(resolve(__dirname, '../../out/main/index.js'))
