import { measureText } from '../dist/index.js';
import { translate, resolveLanguage, saveLanguage } from './i18n.js';

const $ = id => document.getElementById(id);
const samples = {
  default: 'Base2300 packs the same bytes into fewer characters.',
  english: 'The quick brown fox jumps over the lazy dog.',
  japanese: '吾輩は猫である。名前はまだ無い。',
  emoji: '😀😺🌸🚀🎉🌈🎵📚🍣🗾',
  repeat: '同じ情報を、少ない文字で。'.repeat(40),
  empty: '',
};
let lang = resolveLanguage(location, globalThis.localStorage);
const t = (key, params) => translate(lang, key, params);
let worker = null;
let timer = null;
let lastAction = null;
let lastOutput = null;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function measureInput() {
  const m = measureText($('input').value);
  $('input-metrics').textContent = t('inputMetrics', { chars: m.codePoints.toLocaleString(), bytes: m.utf8Bytes.toLocaleString() });
}
function profileHint() { $('profile-hint').textContent = t($('profile').value === 'checked' ? 'hintChecked' : 'hintExperimental'); }
// Apply the static UI strings for the current language. Dynamic texts (status, result) are produced with t() when they appear.
function applyLanguage() {
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-html]')) element.innerHTML = t(element.dataset.i18nHtml);
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', t(element.dataset.i18nAria));
  profileHint();
  measureInput();
}
function stop() {
  worker?.terminate(); worker = null; clearTimeout(timer);
  $('run').disabled = false; $('cancel').disabled = true;
}
function clearResult() { $('result').hidden = true; lastAction = null; lastOutput = null; }
function run() {
  stop(); clearResult();
  $('run').disabled = true; $('cancel').disabled = false;
  status(t('statusRunning'));
  let activeWorker;
  try {
    activeWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker = activeWorker;
  } catch (error) {
    stop(); status(error.message || t('statusWorkerStart'), true); return;
  }
  timer = setTimeout(() => {
    if (worker !== activeWorker) return;
    stop(); status(t('statusTimeout'), true);
  }, 30000);
  activeWorker.onerror = event => {
    if (worker !== activeWorker) return;
    stop(); status(event.message || t('statusWorkerStart'), true);
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
    status(t('statusDone', { ms: Math.round(data.milliseconds) }));
  };
  try { activeWorker.postMessage({ action: $('action').value, profile: $('profile').value, input: $('input').value, lang }); }
  catch (error) { stop(); status(error.message || t('statusPostFailed'), true); }
}
$('run').addEventListener('click', run);
$('cancel').addEventListener('click', () => { stop(); status(t('statusCancelled')); });
$('input').addEventListener('input', () => { stop(); measureInput(); clearResult(); status(t('statusInputUpdated')); });
for (const button of document.querySelectorAll('[data-sample]')) button.addEventListener('click', () => {
  stop(); $('input').value = samples[button.dataset.sample]; $('action').value = 'encode'; measureInput(); clearResult(); status(t('statusSampleLoaded'));
});
for (const id of ['action', 'profile']) $(id).addEventListener('change', () => {
  stop(); clearResult(); status(t('statusSettingsUpdated'));
  profileHint();
});
$('lang').addEventListener('click', () => {
  lang = lang === 'ja' ? 'en' : 'ja';
  saveLanguage(globalThis.localStorage, lang);
  // Result texts came from the Worker in the previous language; clear them rather than show a mixed page.
  stop(); clearResult(); applyLanguage(); status(t('statusIdle'));
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
    if (lastOutput === output) status(t('statusCopied'));
  } catch {
    if (lastOutput !== output) return;
    $('output').focus(); $('output').select();
    status(t('statusSelected'));
  }
});
applyLanguage();
status(t('statusIdle'));
