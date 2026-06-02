from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class WorkspaceFileSelectionTest(unittest.TestCase):
    def test_only_analyzer_keeps_an_active_sidebar_file(self):
        app = read("App.tsx")
        sidebar = read("components/AudioFileSidebar.tsx")

        self.assertIn("const [selectedAnalyzerFileId, setSelectedAnalyzerFileId] = useState<string | null>(null)", app)
        self.assertIn("const selectedFileId = activeTab === 'analyzer' ? selectedAnalyzerFileId : null", app)
        self.assertNotIn("selectedFileIdsByTab", app)
        self.assertNotIn("setSelectedFileIdForTab", app)
        self.assertIn("handleWorkspaceFileSelect", app)
        self.assertIn("onSelectFile={handleWorkspaceFileSelect}", app)
        self.assertIn("selectedFileId={selectedFileId}", app)
        self.assertIn("selectedFileId: string | null", sidebar)

    def test_sidebar_selection_routes_to_transient_splitter_or_converter_actions(self):
        app = read("App.tsx")
        converter = read("components/ConverterPage.tsx")
        splitter = read("components/SplitterPage.tsx")

        self.assertIn("setPendingConverterFile", app)
        self.assertIn("setPendingSplitterFile", app)
        self.assertIn("pendingFile={pendingConverterFile}", app)
        self.assertIn("pendingFile={pendingSplitterFile}", app)
        self.assertIn("handleWorkspaceFileSelect", app)
        self.assertNotIn("selectedFile={converterSelectedFile}", app)
        self.assertNotIn("selectedFile={splitterSelectedFile}", app)
        self.assertIn("pendingFile?: (AudioFile & { requestId: string }) | null", converter)
        self.assertIn("pendingFile?: (AudioFile & { requestId: string }) | null", splitter)
        self.assertIn("addAudioFilesToQueue([pendingFile])", converter)
        self.assertIn("loadAudioFile(pendingFile || null)", splitter)
        self.assertIn("[pendingFile?.requestId]", converter)
        self.assertIn("[pendingFile?.requestId]", splitter)

    def test_converter_and_splitter_no_longer_accept_direct_uploads(self):
        converter = read("components/ConverterPage.tsx")
        splitter = read("components/SplitterPage.tsx")

        self.assertNotIn("handleFileChange", converter)
        self.assertNotIn("type=\"file\"", converter)
        self.assertNotIn("点击上传或拖拽文件到此处", converter)
        self.assertNotIn("handleFileUpload", splitter)
        self.assertNotIn("splitter-file-upload", splitter)
        self.assertNotIn("type=\"file\"", splitter)
        self.assertNotIn("上传音频", splitter)
