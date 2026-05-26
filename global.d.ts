export {};

declare global {
  interface Window {
    electron?: {
      getPythonPort: () => Promise<number>;
    };
  }
}
