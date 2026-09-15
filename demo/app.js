import { measureText } from '../dist/index.js';

const $ = id => document.getElementById(id);
const samples = {
  default: 'Base2300 packs the same bytes into fewer characters.',
  english: 'The quick brown fox jumps over the lazy dog.',
  japanese: '吾輩は猫である。名前はまだ無い。',
  emoji: '😀😺🌸🚀🎉🌈🎵📚🍣🗾',
  repeat: '同じ情報を、少ない文字で。'.repeat(40),
  empty: '',
};
let worker = null;
let timer = null;
let lastAction = null;
let lastOutput = null;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function measureInput() {
  const m = measureText($('input').value);
  $('input-metrics').textContent = `${m.codePoints.toLocaleString()} 文字 / ${m.utf8Bytes.toLocaleString()} B`;
}
function stop() {
  worker?.terminate(); worker = null; clearTimeout(timer);
  $('run').disabled = false; $('cancel').disabled = true;
}
function clearResult() { $('result').hidden = true; lastAction = null; lastOutput = null; }
function run() {
  stop(); clearResult();
  $('run').disabled = true; $('cancel').disabled = false;
  status('変換と復元検査を実行中…');
  let activeWorker;
  try {
    activeWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker = activeWorker;
  } catch (error) {
    stop(); status(error.message || 'Workerの起動に失敗しました。', true); return;
  }
  timer = setTimeout(() => {
    if (worker !== activeWorker) return;
    stop(); status('30秒で処理を中止しました。入力を短くして再試行できます。', true);
  }, 30000);
  activeWorker.onerror = event => {
    if (worker !== activeWorker) return;
    stop(); status(event.message || 'Workerの起動に失敗しました。', true);
  };
  activeWorker.onmessage = ({ data }) => {
    if (worker !== activeWorker) return;
    stop();
    if (data.error) { status(data.error, true); return; }
    lastOutput = data.output;
    $('output').value = data.output; $('result-note').textContent = data.note;
    $('comparison').replaceChildren();
    for (const row of data.rows) {
      const tr = document.createElement('tr');
      if (row.highlight) tr.className = 'highlight';
      for (const value of [row.label, row.codePoints, `${row.utf8Bytes.toLocaleString()} B`, row.utf16Units, row.graphemes]) {
        const td = document.createElement('td'); td.textContent = typeof value === 'number' ? value.toLocaleString() : value; tr.append(td);
      }
      $('comparison').append(tr);
    }
    lastAction = data.action;
    $('roundtrip').hidden = lastAction !== 'encode';
    $('result').hidden = false;
    status(`完了 · ${Math.round(data.milliseconds)} ms（Worker起動時間を除く）`);
  };
  try { activeWorker.postMessage({ action: $('action').value, profile: $('profile').value, input: $('input').value }); }
  catch (error) { stop(); status(error.message || 'Workerへ入力を渡せませんでした。', true); }
}
$('run').addEventListener('click', run);
$('cancel').addEventListener('click', () => { stop(); status('中止しました。'); });
$('input').addEventListener('input', () => { stop(); measureInput(); clearResult(); status('入力を更新しました。'); });
for (const button of document.querySelectorAll('[data-sample]')) button.addEventListener('click', () => {
  stop(); $('input').value = samples[button.dataset.sample]; $('action').value = 'encode'; measureInput(); clearResult(); status('サンプルを読み込みました。');
});
for (const id of ['action', 'profile']) $(id).addEventListener('change', () => {
  stop(); clearResult(); status('設定を更新しました。');
  $('profile-hint').textContent = $('profile').value === 'checked' ? '基本形式はチェックサムで偶発的な破損を検査します。暗号化は行いません。' : '実験形式は予測圧縮などを比較します。CRCを省くため、転送後の誤記や破損を検出できない場合があります。';
});
$('roundtrip').addEventListener('click', () => {
  if (lastAction !== 'encode') return;
  $('input').value = lastOutput; $('action').value = 'decode'; measureInput(); run();
});
$('copy').addEventListener('click', async () => {
  if (lastOutput === null) return;
  const output = lastOutput;
  try {
    // textarea displays CRLF as LF; keep the worker's original string for copying.
    await navigator.clipboard.writeText(output);
    if (lastOutput === output) status('結果をコピーしました。貼り付け先によって改行形式が変わる場合があります。');
  } catch {
    if (lastOutput !== output) return;
    $('output').focus(); $('output').select();
    status('結果を選択しました。手動コピーでは改行形式が変わる場合があります。厳密なバイト保存にはCLIを使用してください。');
  }
});
measureInput();
