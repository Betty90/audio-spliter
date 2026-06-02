import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import path from 'path';
import { app, dialog } from 'electron';
import { logInfo, logWarn, logError } from './logger.js';

let pythonProcess: ChildProcess | null = null;
let pythonPort: number | null = null;
let isReady = false;
let startTimeout: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const PYTHON_START_TIMEOUT = 30000;
const MAX_RESTART_ATTEMPTS = 3;
let restartAttempts = 0;

const INITIAL_BACKOFF_MS = 1000;

export function setShuttingDown(value: boolean): void {
  isShuttingDown = value;
}

function getBackoffDelay(attempt: number): number {
  return INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
}

function getPythonExecutablePath(): { command: string; args: string[] } {
  const isDev = !app.isPackaged;

  if (isDev) {
    return {
      command: 'python',
      args: [path.join(process.cwd(), 'backend', 'server.py'), '--port', '0'],
    };
  }

  const isWindows = process.platform === 'win32';
  const executableName = isWindows ? 'server.exe' : 'server';

  return {
    command: path.join(process.resourcesPath, 'server', executableName),
    args: ['--port', '0'],
  };
}

function parseReadyMessage(data: string): number | null {
  const lines = data.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const readyMatch = line.match(/^READY\s+http:\/\/127\.0\.0\.1:(\d+)$/);
    if (readyMatch) {
      const port = parseInt(readyMatch[1], 10);
      if (!isNaN(port) && port > 0) {
        return port;
      }
    }

    if (line.startsWith('READY') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const portOnly = parseInt(nextLine, 10);
      if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
        return portOnly;
      }
    }
  }

  return null;
}

function healthCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function logPythonStderr(text: string): void {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const accessLogMatch = line.match(/\s-\s(INFO|WARNING|ERROR|CRITICAL)\s-/);

    if (accessLogMatch?.[1] === 'INFO') {
      logInfo(`[Python] ${line}`);
    } else if (accessLogMatch?.[1] === 'WARNING') {
      logWarn(`[Python Warning] ${line}`);
    } else {
      logError(`[Python Error] ${line}`);
    }
  }
}

export function spawnPythonProcess(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (pythonProcess) {
      if (isReady && pythonPort) {
        resolve(pythonPort);
        return;
      }
      reject(new Error('Python process is already starting'));
      return;
    }

    const { command, args } = getPythonExecutablePath();

    logInfo(`[Python Manager] Starting Python server: ${command} ${args.join(' ')}`);

    if (app.isPackaged && !existsSync(command)) {
      reject(new Error(`Bundled Python server executable not found: ${command}`));
      return;
    }

    const env = {
      ...process.env,
      PYTHONPATH: app.isPackaged
        ? path.join(process.resourcesPath, 'server')
        : process.env.PYTHONPATH,
    };

    try {
      pythonProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        detached: false,
      });
    } catch (error) {
      if (!app.isPackaged && command === 'python') {
        logInfo('[Python Manager] Falling back to python3...');
        try {
          pythonProcess = spawn('python3', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
            detached: false,
          });
        } catch (fallbackError) {
          reject(new Error(`Failed to spawn Python: ${fallbackError}`));
          return;
        }
      } else {
        reject(new Error(`Failed to spawn Python: ${error}`));
        return;
      }
    }

    if (!pythonProcess) {
      reject(new Error('Failed to create Python process'));
      return;
    }

    let stdoutBuffer = '';

    startTimeout = setTimeout(() => {
      if (!isReady) {
        logError('[Python Manager] Python startup timeout');
        stopPythonProcess();

        if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          const delay = getBackoffDelay(restartAttempts);
          logInfo(`[Python Manager] Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} after ${delay}ms...`);
          setTimeout(() => {
            spawnPythonProcess().then(resolve).catch(reject);
          }, delay);
        } else {
          dialog.showErrorBox(
            'Python Server Error',
            'Failed to start Python backend server after multiple attempts. Please check your installation.'
          );
          reject(new Error('Python startup timeout'));
        }
      }
    }, PYTHON_START_TIMEOUT);

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutBuffer += text;
      logInfo(`[Python] ${text.trim()}`);

      if (!isReady) {
        const port = parseReadyMessage(stdoutBuffer);
        if (port) {
          pythonPort = port;
          isReady = true;

          if (startTimeout) {
            clearTimeout(startTimeout);
            startTimeout = null;
          }

          healthCheck(port).then((healthy) => {
            if (healthy) {
              logInfo(`[Python Manager] Python server ready on port ${port}`);
              restartAttempts = 0;
              resolve(port);
            } else {
              logWarn('[Python Manager] Health check failed, but port was detected');
              resolve(port);
            }
          });
        }
      }
    });

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      logPythonStderr(data.toString());
    });

    pythonProcess.on('exit', (code: number | null, signal: string | null) => {
      logInfo(`[Python Manager] Python process exited with code ${code}, signal ${signal}`);

      const wasReady = isReady;
      pythonProcess = null;
      isReady = false;
      pythonPort = null;

      if (isShuttingDown) {
        return;
      }

      if (wasReady && code !== 0 && signal !== 'SIGTERM') {
        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          const delay = getBackoffDelay(restartAttempts);
          logInfo(`[Python Manager] Python crashed, attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} after ${delay}ms...`);
          setTimeout(() => {
            spawnPythonProcess().catch((err) => {
              logError(`[Python Manager] Restart failed: ${err}`);
            });
          }, delay);
        } else {
          dialog.showErrorBox(
            'Python Server Crashed',
            'The Python backend server has crashed and could not be restarted. Please restart the application.'
          );
        }
      }
    });

    pythonProcess.on('error', (error: Error) => {
      logError(`[Python Manager] Failed to start Python process: ${error}`);

      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }

      if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        const delay = getBackoffDelay(restartAttempts);
        logInfo(`[Python Manager] Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} after ${delay}ms...`);
        setTimeout(() => {
          spawnPythonProcess().then(resolve).catch(reject);
        }, delay);
      } else {
        dialog.showErrorBox(
          'Python Server Error',
          `Failed to start Python backend: ${error.message}`
        );
        reject(error);
      }
    });
  });
}

export function stopPythonProcess(): void {
  if (startTimeout) {
    clearTimeout(startTimeout);
    startTimeout = null;
  }

  if (!pythonProcess) {
    logInfo('[Python Manager] No Python process to stop');
    return;
  }

  logInfo('[Python Manager] Stopping Python process...');

  pythonProcess.kill('SIGTERM');

  setTimeout(() => {
    if (pythonProcess && !pythonProcess.killed) {
      logInfo('[Python Manager] Force killing Python process...');
      pythonProcess.kill('SIGKILL');
    }
  }, 5000);
}

export function getPythonPort(): number | null {
  return pythonPort;
}

export function isPythonReady(): boolean {
  return isReady;
}

export async function waitForPython(): Promise<number> {
  if (isReady && pythonPort) {
    return pythonPort;
  }

  if (!pythonProcess) {
    return spawnPythonProcess();
  }

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (isReady && pythonPort) {
        clearInterval(checkInterval);
        resolve(pythonPort);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Timeout waiting for Python to be ready'));
    }, PYTHON_START_TIMEOUT);
  });
}
