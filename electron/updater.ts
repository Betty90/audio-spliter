import { app, dialog, shell } from 'electron';
import { logInfo, logError, logWarn } from './logger.js';
import electronUpdater from 'electron-updater';
const { autoUpdater: electronAutoUpdater } = electronUpdater;
import type { UpdateInfo } from 'electron-updater';

const GITHUB_RELEASES_URL = 'https://github.com/Betty90/audio-spliter/releases/latest';

let isUpdateChecking = false;
let isSilent = false;

function showMacUpdatePrompt(info: UpdateInfo): void {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available.`,
    detail: 'macOS automatic installation requires a signed build. Please download and install the latest release manually.',
    buttons: ['Download Manually', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then((result) => {
    if (result.response === 0) {
      shell.openExternal(GITHUB_RELEASES_URL);
    }
  });
}

/**
 * Initialize auto-updater
 * @param silent - If true, don't show UI dialogs (for background checks)
 */
export function initUpdater(silent = false): void {
  isSilent = silent;

  // Configure auto-updater
  electronAutoUpdater.autoDownload = process.platform !== 'darwin';
  electronAutoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin';
  electronAutoUpdater.allowPrerelease = false;
  electronAutoUpdater.allowDowngrade = false;

  // Event handlers
  electronAutoUpdater.on('checking-for-update', () => {
    logInfo('[Updater] Checking for updates...');
    isUpdateChecking = true;
  });

  electronAutoUpdater.on('update-available', (info: UpdateInfo) => {
    logInfo(`[Updater] Update available: ${info.version}`);
    isUpdateChecking = false;

    if (process.platform === 'darwin') {
      showMacUpdatePrompt(info);
      return;
    }

    if (!isSilent) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: 'The update will be downloaded automatically. You will be notified when it\'s ready to install.',
        buttons: ['OK'],
      });
    }
  });

  electronAutoUpdater.on('update-not-available', () => {
    logInfo('[Updater] No updates available');
    isUpdateChecking = false;

    if (!isSilent) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: 'You are running the latest version.',
        buttons: ['OK'],
      });
    }
  });

  electronAutoUpdater.on('error', (err: Error) => {
    logError(`[Updater] Error: ${err.message}`);
    isUpdateChecking = false;

    if (!isSilent) {
      dialog.showErrorBox(
        'Update Error',
        `An error occurred while checking for updates:\n${err.message}`
      );
    }
  });

  electronAutoUpdater.on('download-progress', (progressObj: { percent: number; transferred: number; total: number }) => {
    logInfo(`[Updater] Download progress: ${Math.round(progressObj.percent)}%`);
  });

  electronAutoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logInfo(`[Updater] Update downloaded: ${info.version}`);
    isUpdateChecking = false;

    if (!isSilent) {
      dialog.showMessageBox({
        type: 'question',
        title: 'Install Update',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Do you want to install the update now? The application will restart.',
        buttons: ['Install Now', 'Later'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          electronAutoUpdater.quitAndInstall();
        }
      });
    } else {
      // Silent mode: notify user that update is ready
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} is ready to install.`,
        detail: 'The update will be installed when you quit the application.',
        buttons: ['Install Now', 'Later'],
        defaultId: 1,
      }).then((result) => {
        if (result.response === 0) {
          electronAutoUpdater.quitAndInstall();
        }
      });
    }
  });
}

/**
 * Check for updates
 * @param silent - If true, don't show UI dialogs
 */
export async function checkForUpdates(silent = false): Promise<void> {
  if (isUpdateChecking) {
    logWarn('[Updater] Already checking for updates');
    return;
  }

  if (!app.isPackaged) {
    logWarn('[Updater] Skipping update check in development mode');
    if (!silent) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Updates Unavailable',
        message: 'Update checks are only available in packaged builds.',
        buttons: ['OK'],
      });
    }
    return;
  }

  try {
    isSilent = silent;
    logInfo('[Updater] Checking for updates...');
    await electronAutoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`[Updater] Failed to check for updates: ${message}`);

    if (!silent) {
      dialog.showErrorBox(
        'Update Error',
        `An error occurred while checking for updates:\n${message}`
      );
    }
  }
}

/**
 * Check for updates on startup
 */
export function checkForUpdatesOnStartup(): void {
  setTimeout(() => {
    checkForUpdates(true).catch((error) => {
      logWarn(`[Updater] Silent startup update check failed: ${error}`);
    });
  }, 5000);
}

/**
 * Get update status
 */
export function getUpdateStatus(): { isChecking: boolean; isSilent: boolean } {
  return {
    isChecking: isUpdateChecking,
    isSilent,
  };
}

/**
 * Quit and install update (if downloaded)
 */
export function quitAndInstall(): void {
  electronAutoUpdater.quitAndInstall();
}
