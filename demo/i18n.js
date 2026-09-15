// UI strings for the playground. English is the default; Japanese is available via the header toggle,
// `?lang=ja`, or a previously saved preference. Shared by the page script and the Worker.
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGES = ['en', 'ja'];
const STORAGE_KEY = 'base2300-lang';

export const MESSAGES = {
  en: {
    title: 'Base2300 — an experiment in character count',
    headline: 'How few characters<br><em>can hold the same data?</em>',
    intro: 'A small lab that repacks the same information into 2,300 symbols.<br>It puts character count and byte size side by side and checks that the conversion is reversible.',
    labAria: 'Base2300 conversion',
    action: 'Action',
    actionEncode: 'Encode text',
    actionDecode: 'Decode Base2300',
    profile: 'Format',
    profileChecked: 'Checked · with CRC32',
    profileExperimental: 'Minimize characters · no CRC',
    hintChecked: 'The checked format detects accidental corruption with a checksum. It does not encrypt.',
    hintExperimental: 'The experimental format compares predictive compression and more. It omits the CRC, so typos or corruption after transfer may go undetected.',
    samplesAria: 'Sample inputs',
    samplesLabel: 'Try:',
    sampleDefault: 'Default',
    sampleEnglish: 'English',
    sampleJapanese: 'Japanese',
    sampleEmoji: 'Emoji',
    sampleRepeat: 'Repetition',
    sampleEmpty: 'Empty',
    input: 'Input',
    inputMetrics: '{chars} chars / {bytes} B',
    run: 'Run',
    cancel: 'Cancel',
    statusIdle: 'Input is processed inside this browser.',
    statusRunning: 'Encoding and verifying…',
    statusWorkerStart: 'Could not start the Worker.',
    statusTimeout: 'Stopped after 30 seconds. Try a shorter input.',
    statusPostFailed: 'Could not send the input to the Worker.',
    statusDone: 'Done · {ms} ms (excluding Worker startup)',
    statusCancelled: 'Cancelled.',
    statusInputUpdated: 'Input updated.',
    statusSampleLoaded: 'Sample loaded.',
    statusSettingsUpdated: 'Settings updated.',
    statusCopied: 'Result copied. The destination may change line endings.',
    statusSelected: 'Result selected. Manual copy may change line endings; use the CLI for exact bytes.',
    resultTitle: 'Result',
    copy: 'Copy result',
    roundtrip: 'Decode this result',
    outputAria: 'Result',
    tableCaption: 'Full-length comparison (including identifier and checksum)',
    thRepresentation: 'Representation',
    thChars: 'Characters¹',
    thUtf8: 'UTF-8',
    thUtf16: 'UTF-16 units',
    thGraphemes: 'Graphemes²',
    footnote: '¹ Unicode code points. ² Visible character boundaries. Neither equals display width or AI token count.',
    note1Title: 'Measure what shrinks.',
    note1Body: 'Even when characters go down, UTF-8 bytes can go up. Short inputs and emoji can grow in character count too.',
    note2Title: 'Keep the data intact.',
    note2Body: 'Every conversion is checked against the original bytes. CRC-free formats may not detect later typos or corruption.',
    note3Title: 'Start from curiosity.',
    note3Body: 'For homemade tools with code-point limits, learning Unicode and comparing encodings. Check how the destination counts and preserves characters before relying on it.',
    footerLimits: 'Source/decoded limit 64 KiB · Experimental results vary with native compression support',
    langToggle: '日本語',
    langToggleAria: 'Switch to Japanese',
    // Worker
    errInvalidRequest: 'Invalid action, format or input text.',
    errSurrogate: 'The input contains an unpaired UTF-16 surrogate.',
    errInputLimit: 'This demo accepts up to 64 KiB of source text or decoded output. Use the library or CLI for larger input.',
    errDecodedLimit: "This demo's decoded output limit is 64 KiB. Use the library or CLI for larger data.",
    errRoundTrip: 'Byte-exact round-trip check failed.',
    rowEncodedInput: 'Encoded input',
    rowDecodedText: 'Decoded text',
    rowSource: 'Source text',
    rowBase64: 'Base64',
    rowChecked: 'Base2300 · CRC32',
    rowExperimental: 'Base2300 · experimental',
    noteDecoded: 'Decoded as UTF-8 text. Display and manual copy may change line endings; use the CLI for exact bytes or arbitrary binary.',
    noteEncoded: 'Byte-exact round trip confirmed. Characters {chars}, UTF-8 {bytes} B. Selected: {selected}. {integrity}',
    integrityNone: 'No CRC: typos or corruption after transfer may go undetected.',
    integrityCrc: 'CRC32 included.',
  },
  ja: {
    title: 'Base2300 — 文字数をめぐる実験',
    headline: '文字は、どこまで<br><em>少なくできる？</em>',
    intro: '同じ情報を2,300種類の文字に詰め直す、小さな実験室。<br>文字数とデータ容量を並べて、可逆変換の性質を確かめます。',
    labAria: 'Base2300変換',
    action: '操作',
    actionEncode: 'テキストを変換',
    actionDecode: 'Base2300を復元',
    profile: '形式',
    profileChecked: '基本形式 · CRC32付き',
    profileExperimental: '文字数を最小化 · CRCなし',
    hintChecked: '基本形式はチェックサムで偶発的な破損を検査します。暗号化は行いません。',
    hintExperimental: '実験形式は予測圧縮などを比較します。CRCを省くため、転送後の誤記や破損を検出できない場合があります。',
    samplesAria: 'サンプル入力',
    samplesLabel: '試す：',
    sampleDefault: '標準',
    sampleEnglish: '英語',
    sampleJapanese: '日本語',
    sampleEmoji: '絵文字',
    sampleRepeat: '繰り返し',
    sampleEmpty: '空文字',
    input: '入力',
    inputMetrics: '{chars} 文字 / {bytes} B',
    run: '変換する',
    cancel: '中止',
    statusIdle: '入力はこのブラウザー内で処理します。',
    statusRunning: '変換と復元検査を実行中…',
    statusWorkerStart: 'Workerの起動に失敗しました。',
    statusTimeout: '30秒で処理を中止しました。入力を短くして再試行できます。',
    statusPostFailed: 'Workerへ入力を渡せませんでした。',
    statusDone: '完了 · {ms} ms（Worker起動時間を除く）',
    statusCancelled: '中止しました。',
    statusInputUpdated: '入力を更新しました。',
    statusSampleLoaded: 'サンプルを読み込みました。',
    statusSettingsUpdated: '設定を更新しました。',
    statusCopied: '結果をコピーしました。貼り付け先によって改行形式が変わる場合があります。',
    statusSelected: '結果を選択しました。手動コピーでは改行形式が変わる場合があります。厳密なバイト保存にはCLIを使用してください。',
    resultTitle: '変換結果',
    copy: '結果をコピー',
    roundtrip: 'この結果を復元',
    outputAria: '変換結果',
    tableCaption: '全文の長さ比較（識別子・チェックサムを含む）',
    thRepresentation: '表現',
    thChars: '文字数¹',
    thUtf8: 'UTF-8',
    thUtf16: 'UTF-16単位',
    thGraphemes: '書記素²',
    footnote: '¹ Unicodeコードポイント数。 ² 見た目の文字の区切り。表示幅やAIのトークン数とは異なります。',
    note1Title: '減るものを、確かめる。',
    note1Body: '文字が減っても、UTF-8のバイト数は増えることがあります。短い入力や絵文字では、文字数自体も増えます。',
    note2Title: '元の情報を、そのまま。',
    note2Body: '変換後に原バイトへ戻ることを検査します。CRCなし形式では、後から生じた誤記や破損を検出できない場合があります。',
    note3Title: '探究心から、始める。',
    note3Body: 'コードポイント数に制約がある自作ツール、Unicodeの学習、符号方式の比較に。転送先の数え方と文字の保持を確かめて使います。',
    footerLimits: '元テキスト／復元結果上限 64 KiB · 実験形式はネイティブ圧縮の対応状況で結果が変わります',
    langToggle: 'English',
    langToggleAria: '英語に切り替える',
    // Worker
    errInvalidRequest: '操作・形式・入力テキストが不正です。',
    errSurrogate: '入力に対を持たないUTF-16サロゲートがあります。',
    errInputLimit: 'このデモは元テキスト／復元結果64 KiBまでです。大きい入力にはライブラリまたはCLIを使用してください。',
    errDecodedLimit: 'このデモの復元結果上限は64 KiBです。大きいデータにはライブラリまたはCLIを使用してください。',
    errRoundTrip: '元バイトへの復元検査に失敗しました。',
    rowEncodedInput: '符号化された入力',
    rowDecodedText: '復元テキスト',
    rowSource: '元テキスト',
    rowBase64: 'Base64',
    rowChecked: 'Base2300 · CRC32付き',
    rowExperimental: 'Base2300 · 実験形式',
    noteDecoded: 'UTF-8テキストとして復元しました。表示・手動コピーでは改行形式が変わる場合があります。厳密なバイト保存や任意バイナリにはCLIを使用してください。',
    noteEncoded: '原バイトとの一致を確認。文字数 {chars}、UTF-8 {bytes} B。選択: {selected}。{integrity}',
    integrityNone: 'CRCなし：転送後の誤記・破損は検出できない場合があります。',
    integrityCrc: 'CRC32付き。',
  },
};

/** Normalize any value to a supported language code. */
export function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

/** Look up a string and substitute `{name}` placeholders. */
export function translate(lang, key, params = {}) {
  const template = MESSAGES[normalizeLanguage(lang)][key] ?? MESSAGES[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}

/** Resolve the initial language: `?lang=` wins, then the saved preference, then English. */
export function resolveLanguage(location, storage) {
  const fromQuery = new URL(location.href).searchParams.get('lang');
  if (fromQuery && LANGUAGES.includes(fromQuery)) return fromQuery;
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.includes(saved)) return saved;
  } catch { /* storage may be unavailable; fall through to the default */ }
  return DEFAULT_LANGUAGE;
}

/** Persist the preference; failures (private mode, disabled storage) are ignored. */
export function saveLanguage(storage, lang) {
  try { storage?.setItem(STORAGE_KEY, normalizeLanguage(lang)); } catch { /* ignore */ }
}
