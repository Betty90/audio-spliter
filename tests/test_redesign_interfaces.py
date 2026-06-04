from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class RedesignInterfacesTest(unittest.TestCase):
    def test_preload_exposes_desktop_file_library_methods(self):
        preload = read("electron/preload.js")
        main = read("electron/main.ts")
        declarations = read("global.d.ts")

        for method in [
            "selectAudioFiles",
            "importAudioFilesToLibrary",
            "importAudioFilePathsToLibrary",
            "getClipboardFilePaths",
            "selectOutputDirectory",
            "readFileAsBytes",
            "saveFile",
            "loadLibraryState",
            "saveLibraryState",
            "getStorageStats",
            "revealInFinder",
        ]:
            self.assertIn(method, preload)
            self.assertIn(method, declarations)

        for channel in [
            "select-audio-files",
            "import-audio-files-to-library",
            "import-audio-file-paths-to-library",
            "get-clipboard-file-paths",
            "select-output-directory",
            "read-file-as-bytes",
            "save-file",
            "load-library-state",
            "save-library-state",
            "get-storage-stats",
            "reveal-in-finder",
        ]:
            self.assertIn(channel, main)

        self.assertIn("sourcePath", declarations)
        self.assertIn("audio-library", main)
        self.assertIn("fsPromises.copyFile", main)
        self.assertNotIn("Promise.all(result.filePaths.map(importedFileReference))", main)
        self.assertIn("for (const filePath of result.filePaths)", main)

    def test_pasted_desktop_files_are_imported_into_library_storage(self):
        app = read("App.tsx")
        main = read("electron/main.ts")
        preload = read("electron/preload.js")
        declarations = read("global.d.ts")

        self.assertIn("importAudioFilePathsToLibrary", preload)
        self.assertIn("importAudioFilePathsToLibrary", declarations)
        self.assertIn("import-audio-file-paths-to-library", main)
        self.assertIn("function collectDataTransferFiles(dataTransfer: DataTransfer): File[]", app)
        self.assertIn("Array.from(dataTransfer.items)", app)
        self.assertIn("item.kind === 'file'", app)
        self.assertIn("function collectDataTransferFilePaths(dataTransfer: DataTransfer): string[]", app)
        self.assertIn("dataTransfer.getData('text/uri-list')", app)
        self.assertIn("fileUrlToPath", app)
        self.assertIn("new URL(value)", app)
        self.assertIn("const importFilesToLibrary = useCallback(async (fileList: FileList | File[] | null, extraFilePaths: string[] = [])", app)
        self.assertIn("file as File & { path?: string }", app)
        self.assertIn("window.electron?.importAudioFilePathsToLibrary", app)
        self.assertIn("window.electron?.getClipboardFilePaths", app)
        self.assertIn("mergeUniquePaths", app)
        self.assertIn("handlePaste", app)
        self.assertIn("const clipboardPaths = await (window.electron?.getClipboardFilePaths?.() || Promise.resolve([]))", app)
        self.assertIn("importFilesToLibrary(e.clipboardData?.files || null, clipboardPaths)", app)
        self.assertIn("onDrop", app)
        self.assertIn("const droppedFiles = collectDataTransferFiles(e.dataTransfer)", app)
        self.assertIn("const droppedPaths = mergeUniquePaths(", app)
        self.assertIn("droppedFiles.map(file => getDesktopFilePath(file)).filter(Boolean)", app)
        self.assertIn("collectDataTransferFilePaths(e.dataTransfer)", app)
        self.assertIn("importFilesToLibrary(droppedFiles, droppedPaths)", app)
        self.assertNotIn("newFiles.forEach(upsertLibraryItem)", app)
        self.assertIn("setLibraryItems(prev => {", app)
        self.assertIn("const nextItems = uniqueNewFiles.map(file => toLibraryItem(file, prev.find(item => item.id === file.id)))", app)
        self.assertIn("persistState(next)", app)
        self.assertIn("getClipboardFilePaths: () => ipcRenderer.invoke('get-clipboard-file-paths')", preload)
        self.assertIn("NSPasteboard.generalPasteboard", main)
        self.assertIn('propertyListForType("NSFilenamesPboardType")', main)
        self.assertIn("readClipboardBufferText('FileNameW', 'ucs2')", main)

    def test_library_state_load_and_save_are_resilient_to_partial_writes(self):
        main = read("electron/main.ts")

        self.assertIn("async function loadLibraryState()", main)
        self.assertIn("raw.trim()", main)
        self.assertIn("SyntaxError", main)
        self.assertIn("return JSON.parse(raw)", main)
        self.assertNotIn("mergeStateWithAudioLibraryIndex", main)
        self.assertIn("async function saveLibraryState(state: unknown)", main)
        self.assertIn("const temporaryPath = `${statePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`", main)
        self.assertIn("fsPromises.rename(temporaryPath, statePath)", main)
        self.assertNotIn("fsPromises.writeFile(getLibraryStatePath(), JSON.stringify(state, null, 2), 'utf-8')", main)
        self.assertIn("saveLibraryState: (state) => ipcRenderer.invoke('save-library-state', state)", read("electron/preload.js"))

    def test_backend_conversion_supports_allow_listed_advanced_options(self):
        backend = read("backend/server.py")

        self.assertIn("build_convert_command", backend)
        for field in [
            "video_codec",
            "resolution",
            "frame_rate",
            "video_bitrate",
            "audio_codec",
            "sample_rate",
            "channels",
            "audio_bitrate",
        ]:
            self.assertIn(field, backend)

        self.assertIn("ALLOWED_VIDEO_CODECS", backend)
        self.assertIn("ALLOWED_AUDIO_CODECS", backend)
        self.assertIn("ALLOWED_CHANNELS", backend)

    def test_converter_uses_audio_only_formats_and_top_output_toolbar(self):
        app = read("App.tsx")
        converter = read("components/ConverterPage.tsx")

        self.assertIn("targetFormat: 'm4a'", app)
        self.assertIn("const formatOptions: ConversionSettings['targetFormat'][] = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'flac']", converter)
        self.assertNotIn("['mp4', 'm4a', 'wav', 'mp3']", converter)
        self.assertIn("const audioFormatPresets", converter)
        for preset in [
            "m4a: { audioCodec: 'aac', sampleRate: '48000', channels: 'stereo', audioBitrate: '192' }",
            "mp3: { audioCodec: 'mp3', sampleRate: '44100', channels: 'stereo', audioBitrate: '192' }",
            "wav: { audioCodec: 'wav', sampleRate: '48000', channels: 'stereo', audioBitrate: 'source' }",
            "aac: { audioCodec: 'aac', sampleRate: '48000', channels: 'stereo', audioBitrate: '192' }",
            "ogg: { audioCodec: 'opus', sampleRate: '48000', channels: 'stereo', audioBitrate: '128' }",
            "flac: { audioCodec: 'flac', sampleRate: '48000', channels: 'stereo', audioBitrate: 'source' }",
        ]:
            self.assertIn(preset, converter)
        self.assertIn("data-testid=\"converter-output-toolbar\"", converter)
        self.assertLess(converter.index("data-testid=\"converter-output-toolbar\""), converter.index("转换队列"))
        self.assertNotIn("<SettingsGroup title=\"视频设置\">", converter)
        self.assertNotIn("视频编码", converter)
        self.assertNotIn("分辨率", converter)
        self.assertNotIn("帧率", converter)
        self.assertNotIn("视频码率", converter)

    def test_converter_has_single_start_button_and_clear_row_actions(self):
        converter = read("components/ConverterPage.tsx")

        self.assertEqual(converter.count("onClick={handleConvertAll}"), 1)
        self.assertNotIn("MoreHorizontal", converter)
        self.assertNotIn("Pause", converter)
        self.assertNotIn("Play", converter)
        self.assertIn("title=\"移除\"", converter)
        self.assertIn("<Trash2 size={16} />", converter)

    def test_converter_output_workflow_uses_real_output_directory(self):
        app = read("App.tsx")
        converter = read("components/ConverterPage.tsx")
        main = read("electron/main.ts")

        self.assertIn("function normalizeOutputPolicy", app)
        self.assertIn("directory: policy?.directory || fallbackDirectory", app)
        self.assertIn("normalizeOutputPolicy(persisted?.outputPolicy, downloads || '')", app)
        self.assertIn("window.electron.getDownloadsDirectory?.()", app)
        self.assertIn("window.electron.saveFile", converter)
        self.assertIn("directory: outputPolicy.directory", converter)
        self.assertIn("fileName: outputName", converter)
        self.assertIn("existingFile: outputPolicy.existingFile", converter)
        self.assertIn("outputPolicy.afterConversion === 'reveal'", converter)
        self.assertIn("window.electron.revealInFinder(saved.path)", converter)
        self.assertIn("handleDownloadAll", converter)
        self.assertIn("firstSaved?.outputPath", converter)
        self.assertIn("window.electron.revealInFinder(firstSaved.outputPath)", converter)
        self.assertIn("resolveAvailablePath(directory, options.fileName)", main)
        self.assertIn("options.existingFile === 'overwrite'", main)

    def test_sidebar_file_library_supports_local_collections_and_trash_actions(self):
        types = read("types.ts")
        sidebar = read("components/AudioFileSidebar.tsx")
        app = read("App.tsx")

        self.assertIn("interface LibraryCollection", types)
        self.assertIn("collectionIds", types)
        self.assertIn("sourcePath?: string", types)
        self.assertIn("collections:", types)
        self.assertIn("onCreateLibrary", sidebar)
        self.assertIn("onMoveToLibrary", sidebar)
        self.assertIn("onRestore", sidebar)
        self.assertIn("onPermanentDelete", sidebar)
        self.assertIn('id="sidebar-file-upload"', sidebar)
        self.assertNotIn("升级存储", sidebar)
        self.assertNotIn("存储空间", sidebar)
        self.assertIn("handleCreateLibrary", app)
        self.assertIn("handleMoveToLibrary", app)
        self.assertIn("handleRestoreFile", app)
        self.assertIn("handlePermanentDeleteFile", app)
        self.assertIn("sourcePath: file.sourcePath || existing?.sourcePath", app)
        self.assertIn("sourcePath: payload.sourcePath", app)
        self.assertIn("window.electron.importAudioFilesToLibrary", app)

    def test_sidebar_library_creation_and_file_list_cleanup(self):
        sidebar = read("components/AudioFileSidebar.tsx")
        app = read("App.tsx")

        self.assertNotIn("window.prompt", app)
        self.assertIn("newLibraryName", sidebar)
        self.assertIn("onCreateLibrary(trimmed)", sidebar)
        self.assertIn("handleCreateLibrary = useCallback((name: string)", app)
        self.assertNotIn("ChevronDown", sidebar)
        self.assertNotIn("暂无文件", sidebar)
        self.assertIn("直接删除记录", sidebar)
        self.assertIn("移到回收站", sidebar)

    def test_permanent_delete_cannot_be_readded_by_background_analysis(self):
        app = read("App.tsx")

        self.assertIn("deletedFileIdsRef", app)
        self.assertIn("if (deletedFileIdsRef.current.has(file.id)) return", app)
        self.assertIn("deletedFileIdsRef.current.add(fileId)", app)
        self.assertIn("deletedFileIdsRef.current.delete(file.id)", app)
        self.assertIn("const nextLibrary = prev.filter(item => item.id !== fileId)", app)
        self.assertIn("persistState(nextLibrary)", app)

    def test_custom_library_can_be_deleted_without_deleting_files(self):
        sidebar = read("components/AudioFileSidebar.tsx")
        app = read("App.tsx")

        self.assertIn("onDeleteLibrary", sidebar)
        self.assertIn("删除文件库", sidebar)
        self.assertIn("handleDeleteLibrary = useCallback((collectionId: string, deleteRecords = false)", app)
        self.assertIn("filter(id => id !== collectionId)", app)
        self.assertIn("删除文件库只会移除这个自定义库", app)
        self.assertIn("collectionRecordIds", app)
        self.assertIn("shouldDeleteRecords ? prev.filter(file => !file.collectionIds?.includes(collectionId) && !collectionRecordIds.has(file.id))", app)
        self.assertIn("!collectionRecordIds.has(file.id)", app)
        self.assertIn("secondaryConfirmText: '删除库和记录'", app)
        self.assertIn("onSecondaryConfirm", app)
        self.assertIn("onDeleteLibrary={handleDeleteLibrary}", app)

    def test_sidebar_custom_libraries_and_move_menu_are_bounded(self):
        sidebar = read("components/AudioFileSidebar.tsx")

        self.assertIn("max-h-[150px] overflow-y-auto", sidebar)
        self.assertIn("max-h-[132px] overflow-y-auto pr-0.5", sidebar)
        self.assertIn("data-testid=\"custom-library-scroll\"", sidebar)
        self.assertIn("data-testid=\"move-library-scroll\"", sidebar)

    def test_sidebar_menus_close_outside_and_custom_libraries_collapse(self):
        sidebar = read("components/AudioFileSidebar.tsx")

        self.assertIn("useEffect", sidebar)
        self.assertIn("document.addEventListener('mousedown', handleDocumentMouseDown)", sidebar)
        self.assertIn("setOpenMenuId(null)", sidebar)
        self.assertIn("isCustomLibrariesCollapsed", sidebar)
        self.assertIn("setIsCustomLibrariesCollapsed", sidebar)
        self.assertIn("自定义文件库", sidebar)
        self.assertIn("aria-expanded={!isCustomLibrariesCollapsed}", sidebar)
        self.assertIn("!isCustomLibrariesCollapsed &&", sidebar)

    def test_global_form_font_rule_does_not_override_tailwind_text_utilities(self):
        styles = read("src/styles.css")

        self.assertNotIn("font: inherit", styles)
        self.assertIn("font-family: inherit", styles)

    def test_sidebar_typography_stays_readable_after_font_inherit_fix(self):
        sidebar = read("components/AudioFileSidebar.tsx")

        self.assertIn("text-[12px] font-semibold leading-none text-slate-600", sidebar)
        self.assertIn("text-[11.5px] font-medium", sidebar)
        self.assertIn("truncate text-[12px] font-semibold", sidebar)
        self.assertIn("text-[10.5px] leading-tight", sidebar)
        self.assertNotIn("text-[9.5px]", sidebar)

    def test_settings_modal_uses_compact_desktop_typography(self):
        modal = read("components/SettingsModal.tsx")

        self.assertIn("max-w-[560px]", modal)
        self.assertIn("text-[15px] font-semibold", modal)
        self.assertIn("text-[12px] font-semibold", modal)
        self.assertIn("h-8 w-full", modal)
        self.assertIn("text-[10.5px]", modal)
        self.assertNotIn("text-lg", modal)
        self.assertNotIn("p-6", modal)

    def test_analysis_middle_uses_selected_file_and_shared_row_mode(self):
        app = read("App.tsx")
        table = read("components/AnalysisTable.tsx")

        self.assertIn("type AnalysisRowMode", app)
        self.assertIn("analysisRowMode", app)
        self.assertIn("buildLatencyRows(activeFile)", app)
        self.assertIn("filterLatencyRowsByMode", app)
        self.assertIn("grid-cols-4", app)
        self.assertNotIn("label: '文件数'", app)
        self.assertNotIn("label: '平均音量'", app)
        self.assertIn("files={activeFile ? [activeFile] : []}", app)
        self.assertIn("mode={analysisRowMode}", app)
        self.assertIn("onModeChange={setAnalysisRowMode}", app)

        self.assertIn("mode: AnalysisRowMode", table)
        self.assertIn("onModeChange: (mode: AnalysisRowMode) => void", table)
        self.assertIn("directionKey(row)", table)
        self.assertIn("directionOptions", table)
        self.assertIn("onModeChange(option.key)", table)
        self.assertNotIn("Search", table)
        self.assertNotIn("Filter", table)
        self.assertNotIn("Settings2", table)
        self.assertNotIn("placeholder=\"搜索片段或文件\"", table)
        self.assertNotIn(">筛选<", table)
        self.assertNotIn("'odd'", table)
        self.assertNotIn("'even'", table)
        self.assertNotIn("奇数", table)
        self.assertNotIn("偶数", table)
        self.assertNotIn(">录音文件<", table)
        self.assertNotIn(">平均值<", table)
        self.assertIn(">备注<", table)
        self.assertIn("row.remark", table)
        self.assertNotIn("平均时延:", table)

    def test_analysis_min_latency_uses_positive_waits_only(self):
        app = read("App.tsx")

        self.assertIn("positiveLatencies = latencies.filter(value => value > 0)", app)
        self.assertIn("positiveLatencies.length ? Math.min(...positiveLatencies) : 0", app)

    def test_app_removes_page_intro_header_and_expands_analysis_sidebar(self):
        app = read("App.tsx")
        waveform = read("components/WaveformSidebar.tsx")

        self.assertNotIn("function pageTitle", app)
        self.assertNotIn("currentTitle", app)
        self.assertNotIn("<header", app)
        self.assertNotIn("响应时延分析", app)
        self.assertNotIn("批量格式转换", app)
        self.assertNotIn("音频分割", app)

        self.assertIn("DEFAULT_PANEL_WIDTH_RATIO = 0.34", waveform)
        self.assertIn("MAX_PANEL_WIDTH_RATIO = 0.44", waveform)
        self.assertIn("DESKTOP_ANALYSIS_CONTENT_WIDTH = 860", app)
        self.assertIn("COMPACT_ANALYSIS_CONTENT_WIDTH = 560", app)
        self.assertIn("DESKTOP_ANALYSIS_CONTENT_WIDTH = 860", waveform)
        self.assertIn("MIN_ANALYSIS_CONTENT_WIDTH = 560", waveform)
        self.assertIn("MIN_PANEL_WIDTH = 320", waveform)
        self.assertIn("workspaceWidth - MIN_ANALYSIS_CONTENT_WIDTH", waveform)
        self.assertIn("const viewportMaxWidth = Math.round(window.innerWidth * MAX_PANEL_WIDTH_RATIO)", waveform)
        self.assertIn("Math.min(viewportMaxWidth, workspaceWidth)", waveform)
        self.assertIn("hasMeasuredWorkspaceRef", waveform)
        self.assertIn("!hasMeasuredWorkspaceRef.current && !userResizedRef.current", waveform)
        self.assertIn("style={panelStyle}", waveform)
        self.assertNotIn("transition-all", app)

    def test_analysis_workspace_prioritizes_middle_with_smaller_sidebars(self):
        app = read("App.tsx")
        sidebar = read("components/AudioFileSidebar.tsx")
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("w-[248px]", sidebar)
        self.assertIn("flexBasis: DESKTOP_ANALYSIS_CONTENT_WIDTH", app)
        self.assertIn("minWidth: COMPACT_ANALYSIS_CONTENT_WIDTH", app)
        self.assertIn("relative flex min-h-0 flex-1 overflow-hidden", app)
        self.assertNotIn("EMPTY_PANEL_WIDTH", waveform)
        self.assertIn("getBoundingClientRect()", waveform)
        self.assertIn("const maxInlineWidth = workspaceWidth > 0 ? getMaxPanelWidth(workspaceWidth) : width", waveform)
        self.assertIn("const effectiveWidth = workspaceWidth > 0 ? Math.min(width, maxInlineWidth) : width", waveform)
        self.assertIn("const panelPlacementClass = 'relative'", waveform)
        self.assertNotIn("shouldOverlay", waveform)

    def test_analysis_table_uses_segment_interval_columns_without_play_icon(self):
        table = read("components/AnalysisTable.tsx")
        types = read("types.ts")
        app = read("App.tsx")

        self.assertIn(">片段间隔<", table)
        self.assertIn(">片段1结束<", table)
        self.assertIn(">片段2开始<", table)
        self.assertNotIn(">播放顺序<", table)
        self.assertNotIn(">音色1结束<", table)
        self.assertNotIn(">音色2开始<", table)
        self.assertNotIn("Play,", table)
        self.assertNotIn("<Play", table)
        self.assertIn("ArrowRight", table)
        self.assertIn("segment1Index", types)
        self.assertIn("segment2Index", types)
        self.assertIn("segment1Index: index + 1", app)
        self.assertIn("segment2Index: index + 2", app)
        self.assertIn("segment1Index: i + 1", table)
        self.assertIn("segment2Index: i + 2", table)
        self.assertIn("{row.segment1Index}", table)
        self.assertIn("{row.segment2Index}", table)
        self.assertNotIn("#{row.segment1Index}", table)
        self.assertNotIn("#{row.segment2Index}", table)
        self.assertIn("speakerFrom: current.speaker", table)
        self.assertIn("speakerTo: next.speaker", table)
        self.assertIn("row.speakerFrom", table)
        self.assertIn("row.speakerTo", table)
        self.assertIn("min-w-[760px]", table)
        self.assertIn(">备注<", table)
        self.assertIn("row.remark || '-'", table)
        self.assertIn("px-2.5 py-2.5", table)
        self.assertIn("w-[180px]", table)
        self.assertIn("px-2.5 py-2.5`}>片段间隔", table)
        self.assertIn("w-[80px]", table)
        self.assertIn("px-2.5 py-2.5`}>备注", table)
        self.assertIn("latencyExtremes", table)
        self.assertIn("isBestLatency", table)
        self.assertIn("isWorstLatency", table)
        self.assertIn("text-emerald-700", table)
        self.assertIn("text-red-700 font-extrabold", table)

    def test_analysis_latency_cards_and_threshold_highlighting_are_interactive(self):
        app = read("App.tsx")
        table = read("components/AnalysisTable.tsx")
        styles = read("src/styles.css")

        self.assertIn("label: '间隔数'", app)
        self.assertIn("hint: '片段间隔'", app)
        self.assertNotIn("label: '片段数'", app)
        self.assertIn("analysisStatRows", app)
        self.assertIn("maxRow", app)
        self.assertIn("minRow", app)
        self.assertIn("targetSegmentId", app)
        self.assertIn("setActiveSegmentId(targetSegmentId || null)", app)
        self.assertIn("tone: 'red'", app)
        self.assertIn("bg-red-50 text-red-700 ring-red-100", app)

        self.assertIn("SlidersHorizontal", table)
        self.assertIn("min-w-0 cursor-pointer truncate", table)
        self.assertIn("latencySettingsButtonRef", table)
        self.assertIn("latencySettingsMenuRef", table)
        self.assertIn("latencySettingsPosition", table)
        self.assertIn("updateLatencySettingsPosition", table)
        self.assertIn("window.addEventListener('pointerdown', handlePointerDown)", table)
        self.assertIn("window.addEventListener('keydown', handleKeyDown)", table)
        self.assertIn("event.key === 'Escape'", table)
        self.assertIn("className=\"fixed z-50 w-56", table)
        self.assertIn("style={{ top: latencySettingsPosition.top, left: latencySettingsPosition.left }}", table)
        self.assertIn("overflow-x-auto", table)
        self.assertNotIn("overflow-visible", table)
        self.assertIn("<SlidersHorizontal size={18} strokeWidth={2.2} />", table)
        self.assertIn("latencyHighlightThresholds", table)
        self.assertIn("setLatencyHighlightThresholds", table)
        self.assertIn("low: 1.5", table)
        self.assertIn("high: 3", table)
        self.assertIn("row.latency > latencyHighlightThresholds.high", table)
        self.assertIn("row.latency < latencyHighlightThresholds.low", table)
        self.assertIn("最高和最低时延会始终优先高亮。", table)
        self.assertNotIn("row.latency > 3.0", table)
        self.assertIn(".tool-button:active", styles)
        self.assertIn("cursor: pointer", styles)
        self.assertIn("box-shadow: inset", styles)
        self.assertNotIn("transform: translateY(1px)", styles)

    def test_analysis_segment_remarks_live_update_table_rows(self):
        app = read("App.tsx")
        table = read("components/AnalysisTable.tsx")
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("remark: segment.remark || ''", app)
        self.assertIn("remark: current.remark || ''", table)
        self.assertIn("const nextSegments = localSegments.map", waveform)
        self.assertIn("onUpdateSegments(file.id, nextSegments)", waveform)

    def test_waveform_regions_resync_after_auto_analysis_segments_arrive(self):
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("syncRegionsFromSegments", waveform)
        self.assertIn("regionsRef.current.clearRegions()", waveform)
        self.assertIn("segments.forEach((seg)", waveform)
        self.assertIn("if (!isReady || !regionsRef.current) return", waveform)
        self.assertIn("syncRegionsFromSegments(localSegments)", waveform)

    def test_waveform_uses_ephemeral_object_url_for_wavesurfer(self):
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("const waveformUrl = URL.createObjectURL(file.file)", waveform)
        self.assertIn("url: waveformUrl", waveform)
        self.assertIn("URL.revokeObjectURL(waveformUrl)", waveform)
        self.assertNotIn("url: file.blobUrl", waveform)
        self.assertIn("}, [file?.id, file?.file, file?.blobUrl, channelCount]);", waveform)

    def test_waveform_ignores_stale_wavesurfer_ready_events(self):
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("if (wavesurferRef.current !== ws || wsFileIdRef.current !== waveformFileId) return", waveform)
        self.assertIn("if (wavesurferRef.current === ws) {", waveform)

    def test_waveform_sidebar_compacts_controls_and_segment_rows(self):
        waveform = read("components/WaveformSidebar.tsx")

        self.assertNotIn("个片段 ·", waveform)
        self.assertIn("justify-between gap-2", waveform)
        self.assertIn("const toolGroupClass = hideToolLabels", waveform)
        self.assertIn("flex min-w-0 flex-1 items-center", waveform)
        self.assertIn("const toolButtonClass = hideToolLabels", waveform)
        self.assertIn("const isCompactSegmentRow = effectiveWidth < 460", waveform)
        self.assertIn("!isCompactSegmentRow && displaySidebarSpeakerHint", waveform)
        self.assertNotIn("min-[460px]:inline", waveform)
        self.assertIn("tool-button whitespace-nowrap", waveform)
        self.assertIn("!hideToolLabels &&", waveform)
        self.assertNotIn("sticky top-0", waveform)
        self.assertIn("rounded-lg border px-2 py-1.5", waveform)
        self.assertIn("title={`${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s", waveform)
        self.assertIn("(seg.end - seg.start).toFixed(2)}s`}", waveform)
        self.assertIn("{seg.start.toFixed(1)}-{seg.end.toFixed(1)}s", waveform)
        self.assertIn("w-[72px]", waveform)
        self.assertIn("displaySidebarSpeakerName", waveform)
        self.assertIn("displaySidebarSpeakerHint", waveform)
        self.assertIn("speakerLabels[speaker]?.trim() || speaker", waveform)
        self.assertIn("speakerLabels[normalizedSpeaker]?.trim() ? normalizedSpeaker : ''", waveform)
        self.assertIn("seg.remark || '添加备注'", waveform)

    def test_waveform_region_labels_use_mapped_horizontal_badges(self):
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("function createWaveformRegionLabel", waveform)
        self.assertIn("function getWaveformLabelTone", waveform)
        self.assertIn("displaySidebarSpeakerName(normalizedSpeaker, speakerLabels)", waveform)
        self.assertIn("const tone = getWaveformLabelTone(normalizedSpeaker)", waveform)
        self.assertIn("dataset.speakerKey = normalizedSpeaker", waveform)
        self.assertIn("left = '50%'", waveform)
        self.assertIn("transform = 'translateX(-50%)'", waveform)
        self.assertIn("color = tone.text", waveform)
        self.assertIn("whiteSpace = 'nowrap'", waveform)
        self.assertIn("writingMode = 'horizontal-tb'", waveform)
        self.assertIn("textOverflow = 'ellipsis'", waveform)
        self.assertIn("content: createWaveformRegionLabel(normalizedSpeaker, speakerLabels)", waveform)
        self.assertIn("content: createWaveformRegionLabel(newSeg.speaker, speakerLabels)", waveform)
        self.assertIn("content: createWaveformRegionLabel(newSegment.speaker, speakerLabels)", waveform)
        self.assertNotIn("content: normalizedSpeaker,", waveform)
        self.assertNotIn("content: newSeg.speaker,", waveform)
        self.assertNotIn("content: newSegment.speaker,", waveform)
        self.assertNotIn("left = '8px'", waveform)
        self.assertNotIn("background = tone.background", waveform)
        self.assertNotIn("border = `1px solid ${tone.border}`", waveform)
        self.assertNotIn("boxShadow", waveform)
        self.assertNotIn("textShadow", waveform)

    def test_speaker_label_mapping_drives_table_and_sidebar_display(self):
        types = read("types.ts")
        constants = read("constants.ts")
        app = read("App.tsx")
        table = read("components/AnalysisTable.tsx")
        waveform = read("components/WaveformSidebar.tsx")
        settings = read("components/SettingsModal.tsx")

        self.assertIn("speakerLabels: Record<string, string>", types)
        self.assertIn("speakerLabels: {", constants)
        self.assertIn("'音色1': '客服'", constants)
        self.assertIn("'音色2': '客户'", constants)
        self.assertIn("speakerLabels={activeFile?.settings?.speakerLabels || settings.speakerLabels}", app)
        self.assertIn("settings={activeFile?.settings || settings}", app)
        self.assertIn("speakerLabels?: Record<string, string>", table)
        self.assertIn("displaySpeakerLabel", table)
        self.assertNotIn("fromLabel.secondary", table)
        self.assertNotIn("toLabel.secondary", table)
        self.assertNotIn("normalizeSpeakerKey(row.speakerFrom)", table)
        self.assertNotIn("normalizeSpeakerKey(row.speakerTo)", table)
        self.assertIn("speakerOptions", waveform)
        self.assertIn("<select", waveform)
        self.assertIn("音色映射", settings)
        self.assertIn("updateSpeakerLabel", settings)

    def test_unused_analysis_settings_are_removed_from_ui_and_api(self):
        types = read("types.ts")
        constants = read("constants.ts")
        settings = read("components/SettingsModal.tsx")
        api_service = read("services/apiService.ts")
        backend = read("backend/server.py")
        app_settings = re.search(r"export interface AppSettings \{(?P<body>.*?)\n\}", types, re.S).group("body")
        analyze_audio = re.search(r"export const analyzeAudio = async \((?P<body>.*?)\n\};", api_service, re.S).group("body")
        upload_file = re.search(r"def upload_file\(\):(?P<body>.*?)(?=\n\n@app.route)", backend, re.S).group("body")

        for removed in ("silenceThreshold", "smoothingWidth", "sampleRate"):
            self.assertNotIn(removed, app_settings)
            self.assertNotIn(removed, constants)
            self.assertNotIn(removed, settings)

        for removed in ("noiseThreshold", "smoothingWidth", "sampleRate"):
            self.assertNotIn(removed, analyze_audio)

        for removed in ("noise_threshold", "hop_length", "smoothing_width", "sample_rate"):
            self.assertNotIn(removed, upload_file)


if __name__ == "__main__":
    unittest.main()
