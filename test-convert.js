// 无界面冒烟测试：生成测试视频 -> 全程转换 -> 时间裁剪转换 -> 校验输出与循环标记
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpegPath = require('ffmpeg-static');

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1500)))));
    p.on('error', reject);
  });
}

// 运行并捕获 stderr（用于读取解码进度里的时长）
function runCapture(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err.slice(-1500)))));
    p.on('error', reject);
  });
}

function parseLastTime(log) {
  const times = [...log.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!times.length) return 0;
  const t = times[times.length - 1];
  return (+t[1]) * 3600 + (+t[2]) * 60 + (+t[3]);
}

async function main() {
  const input = path.join(__dirname, 'test-input.mp4');
  const output = path.join(__dirname, 'test-output.gif');
  const trimmed = path.join(__dirname, 'test-trimmed.gif');
  const vf = 'fps=15,scale=320:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse';

  console.log('1. 生成 3 秒测试视频...');
  await run(['-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30', '-y', input]);

  console.log('2. 全程转换为 GIF（无限循环）...');
  await run(['-i', input, '-vf', vf, '-loop', '0', '-y', output]);

  const size = fs.statSync(output).size;
  const hasNetscape = fs.readFileSync(output).includes(Buffer.from('NETSCAPE2.0'));
  console.log(`   输出 ${size / 1024 > 1024 ? (size / 1048576).toFixed(1) + ' MB' : (size / 1024).toFixed(1) + ' KB'}，无限循环标记 NETSCAPE2.0：${hasNetscape ? '存在' : '缺失'}`);
  if (size < 1000 || !hasNetscape) throw new Error('全程转换校验失败');

  console.log('3. 截取 1s ~ 2s 转换为 GIF...');
  await run(['-ss', '1', '-i', input, '-t', '1', '-vf', vf, '-loop', '0', '-y', trimmed]);

  // 解码裁剪后的 GIF，读取实际时长
  const log = await runCapture(['-i', trimmed, '-f', 'null', '-']);
  const duration = parseLastTime(log);
  const trimmedHasNetscape = fs.readFileSync(trimmed).includes(Buffer.from('NETSCAPE2.0'));
  console.log(`   裁剪后 GIF 实际时长：${duration.toFixed(2)} 秒（预期约 1 秒），循环标记：${trimmedHasNetscape ? '存在' : '缺失'}`);
  if (duration < 0.5 || duration > 1.5 || !trimmedHasNetscape) throw new Error('时间裁剪校验失败');

  // 清理测试产物
  [input, output, trimmed].forEach((f) => fs.unlinkSync(f));
  console.log('测试通过');
}

main().catch((e) => {
  console.error('测试失败:', e.message);
  process.exit(1);
});
