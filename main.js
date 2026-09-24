const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let ffmpegPath = require('ffmpeg-static');
// 打包后 ffmpeg 二进制位于 app.asar.unpacked 中，修正路径
if (ffmpegPath && ffmpegPath.includes('app.asar')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 800,
    minWidth: 540,
    minHeight: 660,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// 选择输入视频
ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择视频文件',
    filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 选择输出目录
ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择输出文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 读取视频信息（时长 / 分辨率）
function probeVideo(filePath) {
  return new Promise((resolve) => {
    // 仅运行 ffmpeg -i，输出信息后立即退出，不做实际解码
    const proc = spawn(ffmpegPath, ['-i', filePath]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', () => {
      let duration = null;
      let width = null;
      let height = null;
      const dm = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (dm) duration = (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]);
      for (const line of stderr.split('\n')) {
        if (line.includes('Video:')) {
          const vm = line.match(/(\d{2,5})x(\d{2,5})/);
          if (vm) { width = +vm[1]; height = +vm[2]; }
          break;
        }
      }
      resolve({ duration, width, height });
    });
    proc.on('error', () => resolve({ duration: null, width: null, height: null }));
  });
}

ipcMain.handle('probe-video', (event, filePath) => probeVideo(filePath));

// 转换：MP4 -> GIF（palettegen/paletteuse 优化画质，默认无限循环）
ipcMain.handle('convert', async (event, opts) => {
  const { inputPath, outputDir, fps, width, loop, start, end } = opts;
  const dir = outputDir || path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, baseName + '.gif');

  const info = await probeVideo(inputPath);
  const videoDuration = info.duration || 0;

  // 时间裁剪：start/end 为秒；end 为 0 表示到结尾
  const startTime = Number.isFinite(start) && start > 0 ? start : 0;
  let endTime = Number.isFinite(end) && end > 0 ? end : 0;
  if (videoDuration > 0) {
    if (startTime >= videoDuration) {
      return { ok: false, error: '开始时间超出视频总时长' };
    }
    if (endTime > videoDuration) endTime = videoDuration;
  }
  if (endTime > 0 && endTime <= startTime) {
    return { ok: false, error: '结束时间必须大于开始时间' };
  }
  // 本次实际要转换的时长（用于进度计算）
  const total = endTime > 0 ? endTime - startTime : Math.max(0, videoDuration - startTime);

  const parts = [];
  if (fps > 0) parts.push(`fps=${fps}`);
  if (width > 0) parts.push(`scale=${width}:-2:flags=lanczos`);
  const vf =
    (parts.length ? parts.join(',') + ',' : '') +
    'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse';

  const args = [];
  if (startTime > 0) args.push('-ss', String(startTime)); // 输入前快速精确跳转
  args.push('-i', inputPath);
  if (endTime > 0) args.push('-t', String(endTime - startTime)); // 截取时长
  args.push(
    '-vf', vf,
    '-loop', loop ? '0' : '-1', // 0 = 无限循环
    '-y', outputPath
  );

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args);
    let stderrTail = '';
    const timeRe = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;

    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderrTail = (stderrTail + s).slice(-2000);
      if (total > 0) {
        let m = null;
        let last = null;
        while ((m = timeRe.exec(s))) {
          last = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
        }
        if (last !== null) {
          const pct = Math.min(99, Math.round((last / total) * 100));
          event.sender.send('convert-progress', pct);
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        event.sender.send('convert-progress', 100);
        resolve({ ok: true, outputPath });
      } else {
        resolve({ ok: false, error: stderrTail || `ffmpeg 异常退出（退出码 ${code}）` });
      }
    });
    proc.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
});

// 打开文件夹
ipcMain.handle('open-folder', (event, folderPath) => {
  shell.openPath(folderPath);
});
