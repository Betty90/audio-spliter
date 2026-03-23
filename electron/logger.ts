import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const RETENTION_DAYS = 7;

function getLogDirectory(): string {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS: ~/Library/Logs/AudioSlicer/
    return path.join(os.homedir(), 'Library', 'Logs', 'AudioSlicer');
  } else if (platform === 'win32') {
    // Windows: %APPDATA%/AudioSlicer/logs/
    return path.join(app.getPath('appData'), 'AudioSlicer', 'logs');
  } else {
    // Linux: ~/.config/AudioSlicer/logs/
    return path.join(os.homedir(), '.config', 'AudioSlicer', 'logs');
  }
}

function getLogFilePath(): string {
  const logDir = getLogDirectory();
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(logDir, `app-${dateStr}.log`);
}

function ensureLogDirectory(): void {
  const logDir = getLogDirectory();
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch {
    // Fail silently - don't block startup if logging fails
  }
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${formatTimestamp()}] [${level}] ${message}`;
}

function cleanupOldLogs(): void {
  try {
    const logDir = getLogDirectory();
    if (!fs.existsSync(logDir)) return;

    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('app-') || !file.endsWith('.log')) continue;
      
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > retentionMs) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Fail silently
  }
}

function writeToFile(message: string): void {
  try {
    ensureLogDirectory();
    const logPath = getLogFilePath();
    fs.appendFileSync(logPath, message + '\n', 'utf8');
    
    // Periodically cleanup old logs (check based on minute to avoid doing this every log)
    if (new Date().getSeconds() < 5) {
      cleanupOldLogs();
    }
  } catch {
    // Fail silently - don't block startup if logging fails
  }
}

export function logInfo(message: string): void {
  const formatted = formatMessage('INFO', message);
  console.log(formatted);
  writeToFile(formatted);
}

export function logWarn(message: string): void {
  const formatted = formatMessage('WARN', message);
  console.warn(formatted);
  writeToFile(formatted);
}

export function logError(message: string): void {
  const formatted = formatMessage('ERROR', message);
  console.error(formatted);
  writeToFile(formatted);
}

// Also export a logger object for convenience
export const logger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
};
