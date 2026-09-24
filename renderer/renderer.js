const dropZone = document.getElementById('dropZone');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileDuration = document.getElementById('fileDuration');
const fileResolution = document.getElementById('fileResolution');
const fpsSelect = document.getElementById('fps');
const widthInput = document.getElementById('width');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const loopCheckbox = document.getElementById('loop');
const outputDirLabel = document.getElementById('outputDirLabel');
const chooseDirBtn = document.getElementById('chooseDirBtn');
const convertBtn = document.getElementById('convertBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultEl = document.getElementById('result');

let inputPath = null;
let outputDir = null;
let converting = false;

// 接收主进程的转换进度
window.api.onProgress((pct) => {
  progressFill.style.width = pct + '%';
  progressText.textContent = pct >= 100 ? '转换完成' : `正在转换… ${pct}%`;
});

// 选择文件
dropZone.addEventListener('click', async () => {
  const p = await window.api.selectVideo();
  if (p) await setInput(p);
});

// 拖拽文件
['dragover', 'dragenter'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag');
  });
});
dropZone.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const p = window.api.getPathForFile(file);
  if (p) await setInput(p);
});

async function setInput(p) {
  inputPath = p;
  hideResult();
  progressWrap.classList.add('hidden');
  fileName.textContent = p.split(/[\\/]/).pop();
  fileDuration.textContent = '读取中…';
  fileResolution.textContent = '读取中…';
  fileInfo.classList.remove('hidden');
  convertBtn.disabled = true;

  const info = await window.api.probeVideo(p);
  fileDuration.textContent = info.duration ? formatDuration(info.duration) : '未知';
  fileResolution.textContent = info.width ? `${info.width} × ${info.height}` : '未知';

  // 新文件重置时间裁剪，并提示视频总时长
  startTimeInput.value = '0';
  endTimeInput.value = '';
  endTimeInput.placeholder = info.duration ? `到结尾（共 ${info.duration.toFixed(1)} 秒）` : '到结尾';

  convertBtn.disabled = false;
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 选择输出文件夹
chooseDirBtn.addEventListener('click', async () => {
  const dir = await window.api.selectOutputDir();
  if (dir) {
    outputDir = dir;
    outputDirLabel.textContent = dir;
    outputDirLabel.title = dir;
  }
});

// 开始转换
convertBtn.addEventListener('click', async () => {
  if (!inputPath || converting) return;

  // 读取时间裁剪：结束留空 = 0 = 到结尾
  const start = Math.max(0, parseFloat(startTimeInput.value) || 0);
  const endStr = endTimeInput.value.trim();
  const end = endStr === '' ? 0 : Math.max(0, parseFloat(endStr) || 0);
  if (end > 0 && end <= start) {
    showResult(false, '结束时间必须大于开始时间');
    return;
  }

  converting = true;
  convertBtn.disabled = true;
  hideResult();
  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '正在转换… 0%';

  const res = await window.api.convert({
    inputPath,
    outputDir,
    fps: parseInt(fpsSelect.value, 10),
    width: parseInt(widthInput.value, 10) || 0,
    start,
    end,
    loop: loopCheckbox.checked
  });

  converting = false;
  convertBtn.disabled = false;

  if (res.ok) {
    progressFill.style.width = '100%';
    progressText.textContent = '转换完成';
    showResult(true, `已生成：${res.outputPath}`, res.outputPath);
  } else {
    progressWrap.classList.add('hidden');
    showResult(false, `转换失败：${res.error || '未知错误'}`);
  }
});

function showResult(ok, message, outputPath) {
  resultEl.className = 'card result ' + (ok ? 'success' : 'error');
  resultEl.innerHTML = '';

  const msg = document.createElement('div');
  msg.textContent = message;
  resultEl.appendChild(msg);

  if (ok && outputPath) {
    const btn = document.createElement('button');
    btn.className = 'btn secondary';
    btn.type = 'button';
    btn.textContent = '打开所在文件夹';
    btn.addEventListener('click', () => {
      const dir = outputPath.replace(/[\\/][^\\/]+$/, '');
      window.api.openFolder(dir);
    });
    resultEl.appendChild(btn);
  }
  resultEl.classList.remove('hidden');
}

function hideResult() {
  resultEl.classList.add('hidden');
  resultEl.innerHTML = '';
}
