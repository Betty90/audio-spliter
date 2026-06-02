export {};

declare global {
  interface Window {
    electron?: {
      getPythonPort: () => Promise<number>;
      selectAudioFiles: () => Promise<ElectronFileReference[]>;
      importAudioFilesToLibrary: () => Promise<ElectronFileReference[]>;
      selectOutputDirectory: () => Promise<string | null>;
      readFileAsBytes: (filePath: string) => Promise<ElectronFileBytes>;
      saveFile: (options: ElectronSaveFileOptions) => Promise<ElectronSavedFile>;
      loadLibraryState: () => Promise<unknown>;
      saveLibraryState: (state: unknown) => Promise<{ ok: true }>;
      getStorageStats: (targetPath?: string) => Promise<ElectronStorageStats>;
      revealInFinder: (targetPath: string) => Promise<{ ok: true }>;
      getDownloadsDirectory: () => Promise<string>;
    };
  }

  interface ElectronFileReference {
    path: string;
    sourcePath?: string;
    name: string;
    size: number;
    lastModified: number;
    extension: string;
  }

  interface ElectronFileBytes extends ElectronFileReference {
    data: number[];
  }

  interface ElectronSaveFileOptions {
    directory?: string;
    fileName: string;
    data: number[] | ArrayBuffer | Uint8Array;
    existingFile?: 'auto-rename' | 'overwrite';
  }

  interface ElectronSavedFile {
    path: string;
    fileName: string;
  }

  interface ElectronStorageStats {
    path: string;
    free: number;
    total: number;
    used: number;
  }
}
