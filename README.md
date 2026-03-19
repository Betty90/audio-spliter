# AudioSlicer AI 🎵

智能音频切片与说话人分割工具，基于机器学习算法自动识别音频中的不同说话人，支持可视化编辑和片段导出。

![AudioSlicer AI](https://github.com/user-attachments/assets/placeholder-screenshot.png)

## ✨ 功能特性

### 🎙️ 智能说话人分割
- 基于 **MFCC 特征提取** 和 **GMM/K-Means 聚类** 算法
- 自动识别音频中的不同说话人
- 支持自定义说话人数量
- 可调节静音阈值和片段最小时长

### 📊 可视化波形编辑
- 使用 **wavesurfer.js** 渲染音频波形
- **立体声支持**：左右声道分开显示（L/R 标识）
- 可拖拽调整片段起止时间
- 支持片段合并、删除、重命名

### 💾 片段导出
- 保持原文件格式导出（MP3→MP3, WAV→WAV）
- 无损格式直接复制流
- 有损格式使用高质量重新编码
- 自定义导出文件名格式

### 📈 响应时延分析
- 自动计算音色切换时间
- 分析说话人切换的响应延迟
- 支持导出分析结果到 Excel

## 🛠️ 技术栈

### 前端
- **React 19** + **TypeScript**
- **Vite** 构建工具
- **Tailwind CSS** 样式框架
- **wavesurfer.js** 音频可视化
- **lucide-react** 图标库

### 后端
- **Python Flask** Web 框架
- **librosa** 音频特征提取
- **scikit-learn** 机器学习聚类
- **ffmpeg-static** 音频处理
- **soundfile** 音频文件读写

## 🚀 快速开始

### 环境要求
- **Node.js** 18+ 
- **Python** 3.9+
- **npm** 或 **yarn**

### 安装步骤

1. 克隆仓库
```bash
git clone git@github.com:Betty90/audio-spliter.git
cd audio-spliter
```

2. 安装前端依赖
```bash
npm install
```

3. 安装 Python 依赖
```bash
pip install flask librosa numpy scikit-learn soundfile scipy audioread
# 或使用 conda
conda install flask librosa numpy scikit-learn soundfile scipy audioread
```

4. 启动开发服务器
```bash
npm run dev
```

这将同时启动前端开发服务器（Vite）和后端 API 服务器（Flask）。

### 访问应用
打开浏览器访问 http://localhost:3001

## 📖 使用指南

### 1. 上传音频
- 点击"上传音频文件"按钮
- 或直接将音频文件拖拽到页面
- 支持格式：MP3, WAV, M4A, MP4, AAC, OGG

### 2. 自动分析
- 上传后自动进行说话人分割
- 等待 AI 分析完成
- 在右侧查看检测到的片段列表

### 3. 编辑片段
- **播放**：点击片段或播放按钮
- **调整边界**：在波形上拖拽片段边缘
- **合并**：按住 Ctrl/Cmd 多选片段，点击"合并"
- **删除**：选中片段后点击"删除"
- **重命名**：点击片段的说话人名称进行编辑

### 4. 导出片段
- 点击片段右侧的下载图标
- 片段将以原格式导出（保持 MP3/WAV 等格式）

### 5. 分析时延
- 在左侧表格查看音色切换的响应时延
- 支持导出到 Excel 或复制为 Markdown

## ⚙️ 配置参数

在"设置"面板中可以调整以下参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 说话人数量 | 期望检测的说话人数量 | 2 |
| 最小片段时长 | 小于此值的片段将被忽略 | 0.5s |
| 静音阈值 | RMS 能量阈值，用于静音检测 | 0.005 |
| 最小静音时长 | 短于此的静音会被忽略 | 0.1s |
| 采样率 | 音频采样率 | 16000 |

## 📁 项目结构

```
audio-spliter/
├── backend/               # Python Flask 后端
│   └── server.py          # 音频处理 API（分割、导出）
├── components/            # React 组件
│   ├── WaveformSidebar.tsx    # 波形显示与片段编辑
│   ├── AnalysisTable.tsx      # 时延分析表格
│   ├── SettingsModal.tsx      # 设置面板
│   ├── ConverterPage.tsx      # 格式转换页面
│   └── ...
├── utils/                 # 工具函数
│   └── audioUtils.ts      # 音频处理工具
├── types.ts               # TypeScript 类型定义
├── constants.ts           # 常量配置
├── App.tsx                # 主应用组件
└── package.json
```

## 🔧 API 接口

### POST /upload
上传音频文件进行说话人分割分析

### POST /export_segment
导出指定时间范围的音频片段

### POST /convert
音频格式转换

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 🙏 致谢

- [wavesurfer.js](https://wavesurfer-js.org/) - 音频波形可视化
- [librosa](https://librosa.org/) - 音频特征提取
- [scikit-learn](https://scikit-learn.org/) - 机器学习聚类
