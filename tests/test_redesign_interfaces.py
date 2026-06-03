from pathlib import Path
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
        self.assertIn("const importFilesToLibrary = useCallback(async (fileList: FileList | null, extraFilePaths: string[] = [])", app)
        self.assertIn("file as File & { path?: string }", app)
        self.assertIn("window.electron?.importAudioFilePathsToLibrary", app)
        self.assertIn("window.electron?.getClipboardFilePaths", app)
        self.assertIn("mergeUniquePaths", app)
        self.assertIn("handlePaste", app)
        self.assertIn("const clipboardPaths = await (window.electron?.getClipboardFilePaths?.() || Promise.resolve([]))", app)
        self.assertIn("importFilesToLibrary(e.clipboardData?.files || null, clipboardPaths)", app)
        self.assertIn("onDrop", app)
        self.assertIn("importFilesToLibrary(e.dataTransfer.files)", app)
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

        self.assertIn("DEFAULT_PANEL_WIDTH_RATIO = 0.5", waveform)
        self.assertIn("MIN_ANALYSIS_CONTENT_WIDTH = 800", waveform)
        self.assertIn("MIN_PANEL_WIDTH = 360", waveform)
        self.assertIn("workspaceWidth - MIN_ANALYSIS_CONTENT_WIDTH", waveform)
        self.assertIn("const viewportMaxWidth = Math.round(window.innerWidth * MAX_PANEL_WIDTH_RATIO)", waveform)
        self.assertIn("Math.min(viewportMaxWidth, workspaceWidth)", waveform)
        self.assertIn("hasMeasuredWorkspaceRef", waveform)
        self.assertIn("!hasMeasuredWorkspaceRef.current && !userResizedRef.current", waveform)
        self.assertIn("style={{ width: effectiveWidth }}", waveform)
        self.assertNotIn("transition-all", app)

    def test_analysis_sidebar_only_overlays_when_middle_would_be_too_narrow(self):
        app = read("App.tsx")
        waveform = read("components/WaveformSidebar.tsx")

        self.assertIn("ANALYSIS_CONTENT_WIDTH = 800", app)
        self.assertIn("const [isAnalysisSidebarOverlaying", app)
        self.assertIn("style={isAnalysisSidebarOverlaying", app)
        self.assertIn("width: ANALYSIS_CONTENT_WIDTH", app)
        self.assertIn("onOverlayChange={setIsAnalysisSidebarOverlaying}", app)
        self.assertIn("relative flex min-h-0 flex-1 overflow-hidden", app)
        self.assertIn("onOverlayChange?: (isOverlaying: boolean) => void", waveform)
        self.assertIn("onOverlayChange(shouldOverlay)", waveform)
        self.assertNotIn("EMPTY_PANEL_WIDTH", waveform)
        self.assertIn("getBoundingClientRect()", waveform)
        self.assertIn("const effectiveWidth = workspaceWidth > 0 ? Math.min(width, workspaceWidth) : width", waveform)
        self.assertIn("shouldOverlay", waveform)
        self.assertIn("workspaceWidth - effectiveWidth < MIN_ANALYSIS_CONTENT_WIDTH", waveform)
        self.assertIn("shouldOverlay ? 'absolute right-0 top-0 bottom-0", waveform)
        self.assertNotIn("left: MIN_ANALYSIS_CONTENT_WIDTH", waveform)
        self.assertIn(": 'relative", waveform)

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
        self.assertIn('w-[180px] px-2.5 py-2.5">片段间隔', table)
        self.assertIn('w-[80px] px-2.5 py-2.5">备注', table)
        self.assertIn("latencyExtremes", table)
        self.assertIn("isBestLatency", table)
        self.assertIn("isWorstLatency", table)
        self.assertIn("text-emerald-700", table)
        self.assertIn("text-amber-900", table)

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


if __name__ == "__main__":
    unittest.main()
