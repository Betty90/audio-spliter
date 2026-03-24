import { app, dialog } from 'electron';
import { logInfo, logError, logWarn } from './logger.js';
import electronUpdater from 'electron-updater';
const { autoUpdater: electronAutoUpdater } = electronUpdater;
import type { UpdateInfo } from 'electron-updater';

let isUpdateChecking = false;
let isSilent = false;

/**
 * Initialize auto-updater
 * @param silent - If true, don't show UI dialogs (for background checks)
 */
export function initUpdater(silent = false): void {
  isSilent = silent;

  // Configure auto-updater
  electronAutoUpdater.autoDownload = true;
  electronAutoUpdater.autoInstallOnAppQuit = true;
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

    if (!silent) {
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

    if (!silent) {
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

    if (!silent) {
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

    if (!silent) {
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
    return;
  }

  try {
    isSilent = silent;
    logInfo('[Updater] Checking for updates...');
    await electronAutoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    logError(`[Updater] Failed to check for updates: ${error}`);
  }
}

/**
 * Check for updates on startup (disabled)
 * Auto-updater is disabled to prevent GitHub 404 errors
 */
export function checkForUpdatesOnStartup(): void {
  logInfo('[Updater] Auto-updater is disabled');
  return;
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
