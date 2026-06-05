# 仓库协作指南

## 项目概览

UAudioLab 是一个完全离线运行的桌面音频工作台，集音频文件库、说话人分割、波形编辑、片段导出、响应时延分析和格式转换于一体。项目由 React 19 + TypeScript + Vite 渲染进程、Electron 35 主进程，以及 Flask/Python 音频处理后端组成；后端使用 ONNX Runtime、Silero VAD、CAM++ embedding、kaldi-native-fbank、soundfile 和 ffmpeg 处理音频。

## 关键路径

- `App.tsx`、`index.tsx`、`components/`、`services/`、`utils/`、`types.ts`：渲染进程应用代码。
- `src/styles.css`：全局样式和 Tailwind v4 入口。
- `electron/`：Electron 主进程、preload 桥接、Python 进程管理、文件库持久化、日志和自动更新逻辑。
- `backend/server.py`：Flask API、FFmpeg 初始化、上传分析、片段导出和格式转换路由。
- `backend/neural_diarization.py`：基于 Silero VAD 和 CAM++ embedding 的离线说话人分割实现。
- `backend/models/`：打包进后端的 ONNX 模型资源。
- `backend/requirements.txt`：Python 运行时依赖。
- `scripts/build.js`、`scripts/build-python.sh`、`scripts/build-python.bat`：构建编排脚本。
- `tests/`：覆盖后端、Electron 运行时、界面结构、文件库、转换器、打包和自动更新集成细节的 Python `unittest` 测试。
- `assets/`、`electron-builder.yml`：桌面应用图标、权限、安装器资源和打包配置。

## 项目结构

```text
audio-spliter/
├── App.tsx                  # React 主应用外壳
├── index.tsx                # 渲染进程入口
├── components/              # React UI 组件和功能页面
├── services/                # 前端 API 客户端代码
├── utils/                   # 前端共享工具函数
├── src/styles.css           # 全局样式
├── constants.ts             # 前端共享常量
├── types.ts                 # 共享 TypeScript 类型
├── electron/                # Electron 主进程源码
│   ├── main.ts              # 主进程入口
│   ├── preload.js           # 渲染进程 preload 桥接
│   ├── python-manager.ts    # Python 后端进程生命周期管理
│   ├── logger.ts            # 主进程日志工具
│   └── updater.ts           # 自动更新集成
├── backend/                 # Flask 音频处理后端
│   ├── server.py            # API 路由、FFmpeg 初始化、音频切片逻辑
│   ├── neural_diarization.py # ONNX VAD + embedding 说话人分割逻辑
│   ├── models/              # Silero VAD 和 CAM++ ONNX 模型
│   ├── requirements.txt     # Python 依赖
│   ├── server.spec          # PyInstaller 配置
│   └── runtime_hook.py      # PyInstaller 运行时 hook
├── scripts/                 # 构建编排脚本
├── tests/                   # Python unittest 测试套件
├── assets/                  # 应用图标、entitlements、安装器资源
├── electron-builder.yml     # Electron 打包配置
├── vite.config.ts           # Vite 开发服务器和构建配置
├── tsconfig.json            # 渲染进程 TypeScript 配置
├── package.json             # Node 脚本和依赖
└── README.md                # 面向用户的项目文档
```

## 开发命令

- 安装 Node 依赖：`npm install`
- 本地运行后端或后端测试前安装 Python 依赖：`python3 -m pip install -r backend/requirements.txt`
- 启动 Electron 开发模式：`npm run dev`
  - 等同于 `npm run electron:dev`，由 Electron 自动拉起 Python 后端。
  - Vite 运行在 `3000` 端口，Electron 开发窗口加载 `http://localhost:3000`。
- 启动浏览器调试模式：`npm run web:dev`
  - Flask 后端运行在固定 `5001` 端口，Vite 运行在 `3000` 端口。
  - Vite 会把 `/api` 和 `/convert` 代理到 `http://127.0.0.1:5001`。
- 检查渲染进程类型：`npm run lint`
- 构建渲染进程：`npm run build`
- 构建 Electron 主进程：`npm run electron:build`
- 直接启动 Electron 开发应用：`npm run electron:dev`
- 使用已构建前端预览 Electron 应用：`npm run electron:preview`
- 打包当前平台应用：`npm run electron:pack`
- 打包 macOS 应用：`npm run electron:pack:mac`
- 打包 Windows 应用：`npm run electron:pack:win`
- 打包 Linux 应用：`npm run electron:pack:linux`
- 完整构建和打包流程：`npm run build:all`
- 仅构建 Python 后端包：`npm run build:python`
- 发布到 GitHub Releases：`npm run release`

## 测试命令

- 运行全部 Python 测试：`python3 -m unittest discover -s tests`
- 运行单个测试文件：`python3 -m unittest tests.test_ffmpeg_resolution`
- 声称修改完成前，优先按变更范围执行：
  - TypeScript 相关变更执行 `npm run lint`。
  - 后端、Electron 打包或运行时相关变更执行 `python3 -m unittest discover -s tests`。
  - 渲染进程行为或 Vite 配置变更执行 `npm run build`。
  - `electron/` 下文件变更执行 `npm run electron:build`。

## 代码风格

- Node/TypeScript 代码使用 ESM，`package.json` 中配置了 `"type": "module"`。
- 前端导入可以使用指向仓库根目录的 `@/*` 别名。
- Electron TypeScript 配置比渲染进程更严格；`electron/tsconfig.json` 启用了 `strict`、未使用检查和无隐式返回检查。
- 渲染进程 UI 应保持现有组件风格：Tailwind utility class、lucide-react 图标、紧凑的桌面应用布局。除非明确要求，不要进行大范围视觉重设计。
- 后端 API 入口主要集中在 `backend/server.py`；说话人分割算法集中在 `backend/neural_diarization.py`。
- 音频处理变更应保持聚焦，并为模型路径解析、PyInstaller 打包假设、FFmpeg 解析、格式转换、文件库路径和边界情况补充测试。

## 运行时和打包注意事项

- FFmpeg 优先从 `node_modules/ffmpeg-static` 查找，找不到时回退到系统 `ffmpeg`。
- PyInstaller 打包环境可能运行在 `sys._MEIPASS` 下；路径逻辑需要兼容 bundled 布局。
- ONNX 模型需要兼容源码运行和 PyInstaller bundled 布局；`backend/server.spec` 会把 `backend/models/` 收进 `models/`。
- Electron 用户数据中会保存 `uaudiolab-library-state.json`，音频文件库文件放在 `audio-library/`；路径清理逻辑在 `electron/main.ts`。
- 应用日志目录按平台使用 `UAudioLab`：macOS `~/Library/Logs/UAudioLab/`，Windows `%APPDATA%/UAudioLab/logs/`，Linux `~/.config/UAudioLab/logs/`。
- 打包标识为 `com.uaudiolab.app`，产品名为 `UAudioLab`；发布配置仍指向当前仓库 `Betty90/audio-spliter`。
- 应用图标资源位于 `assets/icons/icon.png`、`assets/icons/icon.ico`、`assets/icons/icon.icns`。
- `dist/`、`electron/dist/`、`release/`、`backend/dist/`、`backend/build/`、`resources/`、`py-dist/`、`py-build/` 等目录都是生成产物。
- `AGENTS.md` 已纳入版本管理；项目流程变化时应同步更新。

## 协作约定

- 不要回滚用户改动或生成产物，除非用户明确要求。
- 优先使用小而聚焦的补丁，避免无关的大范围重构。
- 如果更新 README 中的启动说明，注意 Vite 当前配置端口是 `3000`。
