# UAudioLab

UAudioLab 是一个完全离线运行的桌面音频工作台，面向需要批量整理、分析和导出音频片段的本地工作流。它把音频文件库、说话人分割、波形编辑、响应时延分析、片段导出和格式转换集中在一个 Electron 应用中，所有音频处理都在本机完成。

当前应用由 React 19 + TypeScript + Vite 渲染进程、Electron 35 主进程，以及 Flask/Python 音频后端组成。后端使用 FFmpeg、Silero VAD、CAM++ ONNX embedding、kaldi-native-fbank、ONNX Runtime 和 soundfile 完成离线分析与转换。

## 主要能力

### 音频文件库

- 支持从系统文件选择器、拖拽和桌面文件路径导入音频/视频文件。
- Electron 会把导入文件复制到应用用户数据目录中的 `audio-library/`，并持久化 `uaudiolab-library-state.json`。
- 内置全部文件、最近分析、收藏夹、回收站和自定义分组。
- 支持收藏、移动分组、软删除、恢复、永久删除、重新分析和失败重试。

### 离线说话人分割

- 使用内置 Silero VAD ONNX 模型检测语音区域。
- 使用 CAM++ ONNX 模型提取说话人 embedding，并在本地聚类为不同音色。
- 可配置期望说话人数量、最小片段时长和相邻片段合并间隔。
- 支持为 `音色1`、`音色2` 等默认标签设置业务显示名，例如客服、客户。

### 波形编辑与片段管理

- 使用 wavesurfer.js 渲染波形和可拖拽区域。
- 支持播放、定位、选择片段、调整片段边界、手动新增片段、修改音色、填写备注、删除片段和合并片段。
- 支持立体声波形展示，并在导出时选择左右声道或保留双声道。
- 分析结果和手工修正会同步回文件库状态，便于后续继续处理。

### 响应时延分析

- 自动根据相邻片段计算音色切换间隔。
- 支持按音色切换方向过滤，例如 `音色1 -> 音色2`。
- 支持选择多行并复制为 Excel 友好的 TSV 或 Markdown 表格。
- 支持导出包含片段起止时间和前置间隔的 JSON 中间数据。
- 内置高/低时延阈值高亮，最高和最低时延会优先标记。

### 片段导出

- 通过 Flask 后端调用 FFmpeg 按片段起止时间导出。
- 默认保持原始扩展名和文件名语义。
- 支持 `both`、`left`、`right` 声道策略。
- 对无损格式优先复制流；对有损格式使用高质量重新编码。

### 格式转换

- 独立的转换工作台支持队列式批量转换。
- 当前界面提供 M4A、MP3、WAV、AAC、OGG、FLAC 目标格式。
- 后端转换能力同时保留 MP4、WebM、视频编码、分辨率、帧率和码率等受控参数。
- 支持输出目录选择、保留原名、添加 `converted_` 前缀或 `_converted` 后缀。
- 支持自动重命名或覆盖同名文件，转换完成后可在文件管理器中定位输出。

### 桌面运行能力

- Electron 主进程负责 Python 后端生命周期、文件导入、输出保存、路径解析、日志和自动更新。
- 开发模式下 Electron 会启动 Vite，并自动拉起 Python 后端。
- 浏览器调试模式下 Flask 固定运行在 `5001` 端口，Vite 固定运行在 `3000` 端口。
- 支持 macOS、Windows 和 Linux 打包。

## 技术栈

### 渲染进程

- React 19
- TypeScript
- Vite 6
- Tailwind CSS v4
- wavesurfer.js
- lucide-react

### 桌面主进程

- Electron 35
- electron-builder
- electron-updater
- Node.js ESM

### Python 后端

- Flask
- ONNX Runtime
- Silero VAD ONNX
- CAM++ speaker embedding ONNX
- kaldi-native-fbank
- soundfile
- FFmpeg / ffmpeg-static
- PyInstaller

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.9+
- npm
- 开发后端或运行后端测试时，需要安装 `backend/requirements.txt`

### 安装依赖

```bash
npm install
python3 -m pip install -r backend/requirements.txt
```

### 启动 Electron 开发应用

```bash
npm run dev
```

`npm run dev` 等同于 `npm run electron:dev`。它会先构建 Electron 主进程，然后并行启动 Vite 和 Electron。Electron 开发窗口加载 `http://localhost:3000`，并由主进程管理 Python 后端端口。

### 启动浏览器调试模式

```bash
npm run web:dev
```

该模式会同时启动：

- Flask 后端：`http://127.0.0.1:5001`
- Vite 前端：`http://localhost:3000`

Vite 会把 `/api` 和 `/convert` 代理到 Flask 后端，适合在浏览器里单独调试渲染进程。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发模式 |
| `npm run web:dev` | 启动浏览器调试模式 |
| `npm run lint` | 执行 TypeScript 类型检查 |
| `npm run build` | 构建 Vite 渲染进程 |
| `npm run electron:build` | 构建 Electron 主进程 |
| `npm run electron:preview` | 使用已构建前端预览 Electron 应用 |
| `npm run build:python` | 使用构建脚本打包 Python 后端 |
| `npm run electron:pack` | 构建并按当前平台打包桌面应用 |
| `npm run electron:pack:mac` | 打包 macOS 应用 |
| `npm run electron:pack:win` | 打包 Windows 应用 |
| `npm run electron:pack:linux` | 打包 Linux 应用 |
| `npm run build:all` | 清理后执行完整构建和打包流程 |
| `npm run release` | 构建并发布到 GitHub Releases |

## 测试与检查

```bash
npm run lint
npm run build
npm run electron:build
python3 -m unittest discover -s tests
```

按变更范围优先执行：

- 渲染进程或共享 TypeScript 类型变更：`npm run lint`
- Vite、前端行为或产物相关变更：`npm run build`
- `electron/` 下文件变更：`npm run electron:build`
- Python 后端、FFmpeg、PyInstaller、文件库路径或打包逻辑变更：`python3 -m unittest discover -s tests`

## 使用流程

### 1. 导入文件

在左侧文件库点击添加按钮，或把音频/视频文件拖入应用窗口。桌面模式下文件会导入到应用文件库；浏览器模式下会使用浏览器可访问的本地 `File` 对象。

支持的常见输入包括：

- 音频：MP3、WAV、M4A、AAC、OGG
- 视频/容器：MP4、MOV、WebM

### 2. 分析说话人

导入后可以按文件启动分析。分析请求会把文件上传到本地 Flask 后端，后端将音频转为 16 kHz 单声道，再运行 VAD、embedding 和聚类流程，返回片段列表。

分析参数可在全局设置或单文件设置中调整：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| 说话人数量 | `2` | 期望聚类出的说话人数量 |
| 最小片段时长 | `0.5` 秒 | 短于该值的语音片段会被忽略 |
| 最小静音间隔 | `0.5` 秒 | 同一音色相邻片段间隔小于该值时会合并 |
| 音色标签 | `客服`、`客户` | 用于把 `音色1`、`音色2` 显示为业务名称 |

### 3. 校对片段

在波形面板中播放音频并校对片段。可以拖动区域边界修正时间，修改片段音色，补充备注，或合并连续片段。片段列表和时延表会随着修改同步更新。

### 4. 查看和导出时延

时延表会按相邻片段计算：

```text
响应时延 = 下一片段开始时间 - 当前片段结束时间
```

可以筛选音色切换方向，选择重点行，复制到 Excel 或 Markdown，也可以导出 JSON 中间数据用于后续处理。

### 5. 导出音频片段

在片段列表点击导出按钮即可导出当前片段。导出时会把原文件、起止时间、输出文件名和声道策略发送给本地 Flask 后端，由 FFmpeg 裁剪生成文件。

### 6. 批量转换格式

切换到转换工作台，将文件加入队列，选择目标格式和音频参数，然后批量转换。桌面模式可指定输出文件夹；没有指定目录时会回退为浏览器下载。

## 项目结构

```text
audio-spliter/
├── App.tsx                    # 渲染进程主应用外壳
├── index.tsx                  # React 入口
├── components/                # UI 组件和功能页面
│   ├── AudioFileSidebar.tsx   # 文件库、分组和导航
│   ├── WaveformSidebar.tsx    # 波形、片段编辑和片段导出
│   ├── AnalysisTable.tsx      # 响应时延表格
│   ├── ConverterPage.tsx      # 格式转换工作台
│   ├── SettingsModal.tsx      # 分析参数和音色标签设置
│   └── LabModal.tsx           # 分割结果实验评估面板
├── services/                  # 前端 API 客户端
├── utils/                     # 前端共享工具
├── src/styles.css             # 全局样式和 Tailwind v4 入口
├── types.ts                   # 共享 TypeScript 类型
├── constants.ts               # 默认设置和常量
├── electron/                  # Electron 主进程
│   ├── main.ts                # IPC、窗口、文件库和应用生命周期
│   ├── preload.js             # 渲染进程桥接 API
│   ├── python-manager.ts      # Python 后端进程管理
│   ├── logger.ts              # 桌面日志
│   └── updater.ts             # 自动更新
├── backend/                   # Flask 音频处理后端
│   ├── server.py              # API、FFmpeg 解析、上传分析、导出和转换
│   ├── neural_diarization.py  # VAD、embedding、聚类和模型路径解析
│   ├── models/                # 内置 ONNX 模型
│   ├── requirements.txt       # Python 依赖
│   ├── server.spec            # PyInstaller 配置
│   └── runtime_hook.py        # PyInstaller 运行时 hook
├── scripts/                   # 构建编排脚本
├── tests/                     # Python unittest 测试套件
├── assets/                    # 应用图标和安装器资源
├── electron-builder.yml       # 桌面打包配置
├── vite.config.ts             # Vite 开发服务器和代理配置
├── tsconfig.json              # 渲染进程 TypeScript 配置
└── package.json               # Node 脚本和依赖
```

## 运行时与打包说明

- FFmpeg 优先从 `node_modules/ffmpeg-static` 查找，找不到时回退到系统 `ffmpeg`。
- PyInstaller 打包后可能运行在 `sys._MEIPASS` 下，后端模型路径和 FFmpeg 路径都需要兼容 bundled 布局。
- ONNX 模型源码运行时位于 `backend/models/`，打包后会放入 `models/`。
- 文件库状态保存在 Electron `userData` 目录下的 `uaudiolab-library-state.json`。
- 导入到文件库的音频副本保存在 Electron `userData` 目录下的 `audio-library/`。
- 桌面日志目录按平台使用 `UAudioLab`：macOS 为 `~/Library/Logs/UAudioLab/`，Windows 为 `%APPDATA%/UAudioLab/logs/`，Linux 为 `~/.config/UAudioLab/logs/`。
- 应用标识为 `com.uaudiolab.app`，产品名为 `UAudioLab`。
- 当前发布仓库配置指向 `Betty90/audio-spliter`。

## 致谢

- [wavesurfer.js](https://wavesurfer-js.org/) - 音频波形可视化
- [Silero VAD](https://github.com/snakers4/silero-vad) - 语音活动检测
- [3D-Speaker / CAM++](https://github.com/modelscope/3D-Speaker) - 说话人 embedding
- [ONNX Runtime](https://onnxruntime.ai/) - 本地模型推理
- [FFmpeg](https://ffmpeg.org/) - 音频裁剪和格式转换
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用
- [PyInstaller](https://pyinstaller.org/) - Python 后端打包
