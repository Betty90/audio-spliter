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

    def test_sidebar_selection_routes_to_transient_converter_action_only(self):
        app = read("App.tsx")
        converter = read("components/ConverterPage.tsx")

        self.assertIn("setPendingConverterFile", app)
        self.assertIn("pendingFile={pendingConverterFile}", app)
        self.assertNotIn("setPendingSplitterFile", app)
        self.assertNotIn("pendingFile={pendingSplitterFile}", app)
        self.assertNotIn("activeTab === 'splitter'", app)
        self.assertFalse((ROOT / "components/SplitterPage.tsx").exists())
        self.assertIn("handleWorkspaceFileSelect", app)
        self.assertNotIn("selectedFile={converterSelectedFile}", app)
        self.assertNotIn("selectedFile={splitterSelectedFile}", app)
        self.assertIn("pendingFile?: (AudioFile & { requestId: string }) | null", converter)
        self.assertIn("addAudioFilesToQueue([pendingFile])", converter)
        self.assertIn("[pendingFile?.requestId]", converter)

    def test_converter_no_longer_accepts_direct_uploads(self):
        converter = read("components/ConverterPage.tsx")

        self.assertNotIn("handleFileChange", converter)
        self.assertNotIn("type=\"file\"", converter)
        self.assertNotIn("点击上传或拖拽文件到此处", converter)

    def test_splitter_workspace_is_removed_from_sidebar_and_types(self):
        sidebar = read("components/AudioFileSidebar.tsx")
        types = read("types.ts")

        self.assertNotIn("'splitter'", types)
        self.assertNotIn("Scissors", sidebar)
        self.assertNotIn("label: '分割'", sidebar)
