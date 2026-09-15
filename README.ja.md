# Base2300

**同じ情報を、どこまで少ない文字にできるか。**

2,300種類のUnicode文字を使った、探究心のための可逆変換プロジェクトです。
目的は **Unicodeコードポイント数の削減**。文字が減った結果、UTF-8のデータ容量が
増える場合も、そのまま実験結果として扱います。

[English](README.md) · [実測比較](docs/benchmarks.md) ·
[調査・活用例・デメリット](docs/research.ja.md) · [形式仕様](docs/format-v1.md)

同じ作者の非公開プロジェクト内の実装から独立させた、
TypeScriptライブラリ・Node.js CLI・ブラウザーデモです。
実行時の外部パッケージ依存、外部サーバー、モデルのダウンロード、APIキーは不要です。
**初回独立リリースの準備段階にある実験的な実装です。**

## 実際に、何が小さくなるか

各セルは **文字数 / UTF-8バイト数**。識別子やCRCを含む全文の値です。

| 入力 | 原文 | Base64 | 基本形式・CRC32付き | 実験形式・CRCなし |
| --- | ---: | ---: | ---: | ---: |
| 短い英語 | 13 / 13 | 20 / 20 | 13 / 37 | 10 / 28 |
| 短い日本語 | 9 / 27 | 36 / 36 | 15 / 41 | 10 / 26 |
| 日本語の文章 | 46 / 138 | 184 / 184 | 58 / 174 | 43 / 123 |
| 絵文字列 | 22 / 80 | 108 / 108 | 62 / 186 | 37 / 107 |
| 固定シードの疑似乱数 | — / 4,096 | 5,464 / 5,464 | 2,959 / 8,720 | 2,956 / 8,723 |

実験形式の列は、ネイティブ圧縮を加える前の全候補比較です。Node 22.21.1による
固定の合成入力の実測で、言語全体の平均性能を意味しません。絵文字の入力は22コードポイント、
見た目の区切りでは8書記素です。Base64はCRCを持ちません。

疑似乱数のCRC32付き基本形式では、Base64より **文字数が45.8%減り、容量が59.6%増えます**。
一方で日本語の文章の実験形式では、文字数と容量の両方が減っています。
容量が必ず増えるわけでも、文字数が必ず減るわけでもありません。

[完全な実測表](docs/benchmarks.md)にはgzip/Brotli＋Base64、CRC条件を近づけた比較、
UTF-16単位・書記素数・JSON・URL化後の容量、処理時間、失敗しやすい入力を含めています。
再現に必要な入力と設定はリポジトリに同梱しています。

## すぐに試す

Node.js 22以上とnpmを用意し、このディレクトリ内で実行します。

```sh
npm ci
npm run check
npm run demo
```

**http://127.0.0.1:2300/demo/** を開きます。入力を変えて、文字数・UTF-8容量・UTF-16単位・
書記素数を比較できます。処理はWorker内で行い、中止可能です。変換後に元バイトへの完全一致も
確認します。元テキスト・復元結果の上限はデモが64 KiB、ライブラリが4 MiBです。
符号化文字列には、容量の拡大を考慮した別の上限があります。
これらはローカルで実行する手順で、npmやWebサイトの公開済み状態を前提にしていません。

## 基本API

```js
import { encode, decode, measureText } from './dist/index.js';

const bytes = new TextEncoder().encode('Base2300 packs the same bytes into fewer characters.');
const wire = encode(bytes);
console.log(wire); // あ殻律注架霊慮彫需仕林爽模製兆氏9帝否い壁燃克夢浄備餓計麗蹴香懐叔汰体桜
console.log(measureText(wire)); // { codePoints: 36, utf16Units: 36, utf8Bytes: 106 }（入力は 52 / 52 / 52）
const restored = decode(wire); // 元と一致するUint8Array
```

インストール後は `base2300` からimportします。基本APIはCRC32付きv1のみを扱います。
`encodeText` / `decodeText` は厳密なUTF-8用で、BOMも保持します。
JavaScriptの孤立サロゲートや、UTF-8でないバイナリをテキストとして復元する操作は拒否します。
任意バイナリにはバイトAPIを使います。

CRC32は偶発的な破損検出用です。暗号化や改ざんを防ぐ認証にはなりません。

## 文字数をさらに比較する実験API

```js
import {
  encodeBase2300Advanced,
  extendBase2300WithNative,
  decodeBase2300AdvancedAsync,
} from './dist/experimental.js';

const bytes = new TextEncoder().encode('The same sentence repeats. '.repeat(20));
const portable = encodeBase2300Advanced(bytes, 'fast');
const result = await extendBase2300WithNative(bytes, portable);
console.log(result.text, result.selectedId, result.integrity, result.trials);
const restored = await decodeBase2300AdvancedAsync(result.text);
```

インストール後は `base2300/experimental` からimportします。文字種モデル・オンライン予測・
対応環境のDEFLATE/Brotliを比較し、実行した候補の全文字数から選びます。
最短形式はCRCを省くため、**誤記した文字列が別の内容として復元できる場合があります**。
ネイティブ形式には受信側の対応も必要です。元プロジェクト由来のLLM形式は識別番号を予約したまま、
明示的に未対応とします。`extendBase2300WithNative` に渡す候補情報は、同じバイト列から
生成したものを使います。入力を途中で変更したり、別のメッセージの候補情報を流用したりしないでください。
[詳しい仕様](docs/format-experimental.md)

## CLI

```sh
node bin/base2300.mjs encode input.bin > encoded.txt
node bin/base2300.mjs decode encoded.txt > restored.bin
node bin/base2300.mjs encode --experimental input.txt > compact.txt
node bin/base2300.mjs decode --experimental compact.txt > restored.txt
```

ファイルを省略するか `-` にすると標準入力を読みます。標準出力に余分な改行は付けません。
`--native` はネイティブ候補を有効にし、その出力の復元にも使います。
符号を保存するエディターが改行を追加したり正規化したりすると復元に失敗する場合があります。

## 活用を考えられる場面

- **Unicodeや情報符号化の教材**：基数、圧縮モデル、チェックサム、文字の数え方を比較する。
- **自作アプリの設定・リプレイコード**：コードポイント数が制約で、双方に復号器があり、
  文字が変更されない経路で試す。文字数上限のサービスすべてに使えるとは限らない。
- **圧縮方式の研究用ベースライン**：同じ入力・同じ破損検出条件で、文字集合や予測器を比較する。

これらは活用案です。外部の実サービスでの採用実績は確認していません。
手入力・音読・OCR・URL・ASCII限定の通信・バイト容量節約・LLMへの意味伝達では不利な点が多く、
トークン数の削減も保証しません。[調査と用途別の評価](docs/research.ja.md)に詳しく記載しました。

## デメリットと制約

- 出力の大半はUTF-8で3バイト。`𠮟`は4バイト、UTF-16では2単位です。
- NFD/NFKDは `ゔ`・`ヴ` を分解します。符号を正規化・大文字小文字変換しないでください。
- 全角の幅、コードポイント、書記素、AIのトークンは別の指標です。
- 文字表・復号器の配布量、候補比較のCPU時間や中間メモリも必要です。
- 原バイト列と復元後のバイト列は4 MiB以下です。符号化文字列には別の長さ上限があり、
  UTF-8容量は4 MiBを超えることがあります。
- 既存の文字表や識別番号を変えると、保存済みデータを復元できなくなります。
- 元のUIは既存実装を継続使用します。独立パッケージへの差し替えは今後の統合作業です。

## 開発とライセンス

```sh
npm run benchmark
npm pack --dry-run
```

[設計](docs/architecture.md)・[貢献ガイド](CONTRIBUTING.md)・[公開手順](docs/releasing.md)・
[安全性と信頼境界](SECURITY.md)・[検証記録](docs/validation.md)を同梱しています。短くならない例や、不利な条件の報告も歓迎します。
探究によって、この発想の効く範囲と限界を見つけることを目的にしています。

実装は [MIT](LICENSE)、Unicode由来のデータは [Unicode-3.0](licenses/unicode-3.0.txt)。
由来は [NOTICE](NOTICE) を参照してください。
