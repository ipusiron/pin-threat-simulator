# TECHNICAL.md

開発者向けテクニカルドキュメント - PIN Threat Simulator

このドキュメントでは、本ツールの実装、仕組み、コアロジックの要点を解説します。
エンジンの純粋ロジックは `pin-engine.js` に、画面に出す文言は `pts-messages.js` に、
DOM 処理は `script.js` に分かれています。`script.js` は `type="module"` で読み込まれ、
`pin-engine.js` と `pts-messages.js` を `import` します。

---

## 目次

1. [PINパターン計算エンジン](#pinパターン計算エンジン)
2. [攻撃シミュレーション - 信頼度モデル](#攻撃シミュレーション---信頼度モデル)
3. [レーダーチャート描画 - High DPI対応](#レーダーチャート描画---high-dpi対応)
4. [熱解析 - 指数減衰シミュレーション](#熱解析---指数減衰シミュレーション)
5. [音響解析 - ピーク検出アルゴリズム](#音響解析---ピーク検出アルゴリズム)
6. [PINランキング - 複合スコアリング](#pinランキング---複合スコアリング)
7. [手で隠すモード - 永続的マスキング](#手で隠すモード---永続的マスキング)
8. [テストとCI](#テストとci)
9. [パフォーマンス最適化](#パフォーマンス最適化)
10. [開発時の注意点](#開発時の注意点)
11. [今後の拡張可能性](#今後の拡張可能性)
12. [参考文献・関連技術](#参考文献関連技術)

---

## PINパターン計算エンジン

### 概要

- 入力: `digits`（候補集合 S、0〜9 の部分集合、重複なし）、`pinLen` n（1〜8）、
  `mode`（`allowed` / `must` / `partial`）、`allowDup`、`wilds`（長さ n の配列。
  各要素は `*` か 1 桁の数字。`null` なら制約なし）
- 出力: `{count, candidates, steps}`。`candidates` は辞書順。
  件数が上限以下（allowed/must は 5,000、partial は 500）のときだけ列挙する

### 実装場所

- `pin-engine.js:computeCandidates`
- 補助: `parseWildcards`、`binom`、`generateCombinations`、`countPeaks`、`videoAccuracy`、`thermalDecay`
- 期待値の総当たり照合: `test/engine.test.js`

### モード別の仕様

#### 1. 許容集合モード（allowed）

- 各桁は S から選ぶ
- 固定桁は指定の数字に固定する。その数字が S にないときは候補 0 とし、理由を `steps` に書く
- `allowDup = false` なら全桁が互いに異なる（固定桁も使用済みに数える）
- 計算式（重複あり）: 自由桁数 f、A = |S| として `A^f`
- 計算式（重複なし）: `P(A - 固定桁で使った数, f) = ∏_{i=0..f-1}(A' - i)`

実装の要点（`pin-engine.js` 内）:

```javascript
if(allowDup){
  const count = Math.pow(digitSet.length, f);
  // ... 列挙は count <= ENUM_CAPS.allowed のときのみ
}
// no-dup
const available = digitSet.filter(d => !fixedDup.has(d));
let count = 1;
for(let i = 0; i < f; i++) count *= (available.length - i);
```

- 反復乗算で中間結果のオーバーフローを避ける
- `Math.pow` は重複ありのみで使用

#### 2. 必須包含モード（must）

- 各桁は S から選び、かつ S のすべての数字を少なくとも 1 回含む
- 固定桁は同様。固定桁の数字が S にないときは候補 0
- `allowDup = false` は `n == |S|` のときのみ候補があり、固定桁を除いた残りの順列
- `allowDup = true` は包除原理:

```
count = Σ_{i=0..k'} (-1)^i × C(k', i) × (A - i)^f

A  = |S|
f  = 自由桁数（n - 固定桁数）
R  = 固定桁で含まれていない必須数字の集合、k' = |R|
```

包除原理の実装（`countWithRequired`）:

```javascript
function countWithRequired(alphabetSize, n, requiredCount){
  const k = requiredCount;
  const A = alphabetSize;
  let total = 0;
  for(let i = 0; i <= k; i++){
    const term = binom(k, i) * Math.pow(A - i, n);
    total += (i % 2 === 0) ? term : -term;
  }
  return total;
}
```

数学的背景: n 桁の列のうち、R に含まれるどれかの数字が「使われない」事象の個数を交互和で引く。
`i` 個の必須数字を禁じたときの残りの選択肢は `A - i` 個で、それぞれ独立に n 桁並ぶので `(A - i)^n` 通り。

#### 3. 部分特定モード（partial）

- 各桁は 0〜9 から選ぶ（S は使わない）
- 固定桁は同様（固定桁の数字が S にあるかどうかはチェックしない）
- `allowDup = false` なら全桁が互いに異なる
- 列挙の上限は `ENUM_CAPS.partial = 500`（他モードよりも狭い。10 桁全列挙は現実的でないため）

### 固定された期待値（抜粋）

| 入力 | 期待値 |
| --- | --- |
| S={1,2,3}, n=4, allowed, dup | 81 |
| 同 `*,*,2,*` | 27 |
| 同 `*,*,7,*`（7 ∉ S） | 0 |
| S={1,2,3}, n=4, allowed, no-dup | 0 |
| S={1,2,3,4}, n=4, allowed, no-dup | 24 |
| 同 `*,*,2,*` | 6 |
| S={1,2,3}, n=4, must, dup | 36 |
| 同 `*,*,2,*` | 12 |
| S={1,2,3}, n=3, must, no-dup | 6 |
| 同 `*,2,*` | 2 |
| S={1,2,3}, n=4, must, no-dup | 0 |
| partial, dup, n=4 | 10000 |
| 同 `*,*,2,*` | 1000 |
| partial, no-dup, n=4 | 5040 |
| 同 `*,*,2,*` | 504 |

### 二項係数の実装

反復式で中間結果のオーバーフローを避け、`Math.round` で浮動小数点誤差を補正します。
対称性 `C(n,k) = C(n,n-k)` を利用して反復回数を半減します。

```javascript
export function binom(n, k){
  if(k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let res = 1;
  for(let i = 1; i <= k; i++){
    res = res * (n - (k - i)) / i;
  }
  return Math.round(res);
}
```

計算量:

- 再帰版（`C(n,k) = C(n-1,k-1) + C(n-1,k)`）: 指数時間
- 反復版（本実装）: `O(min(k, n-k))`

### 候補列挙

件数が上限以下の場合に辞書順で列挙します。上限は `ENUM_CAPS` で定義されており、
allowed/must が 5,000、partial が 500 です。表示は 1,000 件まで、
全件は CSV エクスポートで取得できます。

列挙の基本形は `generateCombinations(alphabet, n, cap)`:

```javascript
export function generateCombinations(alphabet, n, cap){
  if(n === 0) return [''];
  if(Math.pow(alphabet.length, n) > cap) return null;
  const out = [];
  const buf = new Array(n);
  function rec(i){
    if(out.length > cap) return;
    if(i === n){ out.push(buf.join('')); return; }
    for(const d of alphabet){
      buf[i] = d;
      rec(i + 1);
      if(out.length > cap) return;
    }
  }
  rec(0);
  return out;
}
```

- バックトラッキングによる深さ優先探索
- 空間サイズが `cap` を超えると `null` を返して早期終了
- 文字列結合は末尾の `buf.join('')` に集約（毎階層の `prefix + d` を避ける）

`computeCandidates` 内の列挙では、固定桁をあらかじめ埋めた上で自由桁だけを回し、
`predicate(buf)` で必須包含の条件を満たすものだけを採る、という形になっています。

### ワイルドカードのパース

```javascript
export function parseWildcards(raw, pinLen){
  if(raw == null) return null;
  const s = String(raw).trim();
  if(!s) return null;
  const toks = s.split(',').map(t => t.trim());
  if(toks.length !== pinLen) return null;
  for(const t of toks){
    if(t === '*') continue;
    if(!/^[0-9]$/.test(t)) return null;
  }
  return toks;
}
```

- カンマ区切りで要素数が `pinLen` 以外なら `null`
- 各要素は `*` か 1 桁の数字でなければ `null`
- 不正な場合は呼び出し側で「ワイルドカードなし」として扱う

---

## 攻撃シミュレーション - 信頼度モデル

### 盗撮解析の信頼度計算

```
confidence = 100 - anglePenalty - errorPenalty

anglePenalty = (angle === 'tilt') ? 30 : 0
errorPenalty = min(50, pixelErr × 1.5)
```

- 「真上」は基準値 100%（視点由来のペナルティなし）
- 「斜め」は視点ペナルティ -30%
- ピクセル誤差は 1px あたり 1.5% のペナルティ、上限 50%

### 検出数削減モデル

視点角度が `tilt` のときは、`videoAccuracy(pixelErr) = max(0.5, 1 - pixelErr/50)` を使い、
検出候補数を `ceil(count × accuracy)` に減らします。

```javascript
export function videoAccuracy(pixelErr){
  const err = Math.max(0, Number(pixelErr) || 0);
  return Math.max(0.5, 1 - err / 50);
}
```

挙動の例:

```
videoAccuracy(0)   = 1.00
videoAccuracy(8)   = 0.84
videoAccuracy(15)  = 0.70
videoAccuracy(25)  = 0.50（下限）
videoAccuracy(50)  = 0.50
```

さらに `pixelErr > 20` のときは、角度に関係なく検出数を半減させます（`ceil(candidates.length / 2)`、
最低 1 個は残す）。これは「ある程度以上の誤差では、個々の押下位置の特定自体が困難になる」ことを
反映した補正です。

### データ構造

```javascript
window._attackResults.video = {
  candidates: ['1', '2', '3', '4'],  // 検出された数字
  confidence: 88,                     // 信頼度 (0-100)
};
```

他の手法の結果も含めると以下のとおりです。

```javascript
window._attackResults = {
  finger: ['1', '2', '3'],                              // 配列（検出された数字）
  thermal: {candidates: [...], orderConfidence: 85},    // オブジェクト（順序情報あり）
  audio: 4,                                             // 数値（桁数のみ）
  video: {candidates: [...], confidence: 88},           // オブジェクト（検出数字と信頼度）
};
```

### レーダーチャートスコアへの統合

```javascript
// pin-engine.js
video: results.video
  ? radarScore(results.video.candidates.length, results.video.confidence)
  : 0
// radarScore(n, c) = Math.min(100, n * 15 + c * 0.5)
```

- 検出数が主要因子（1 桁あたり +15 pt）
- 信頼度は補助的要素（×0.5 の重み）
- 4 桁全検出 + 信頼度 100% の場合、`4×15 + 100×0.5 = 110` → 100（上限クランプ）

### スコア計算の集約（第3弾で `pin-engine.js` へ移管）

`simRun()` と `generatePINRanking()` と `generateExpertHints()` は、
以下の純粋関数を呼ぶだけになっています。式を変えるときは `pin-engine.js`
と `test/engine.test.js`（README の4例の検算と `rankPins` の重み）を同時に
更新します。

| 関数 | 役割 |
| --- | --- |
| `videoConfidence({viewpoint, pixelErr})` | 盗撮解析の信頼度 `100 - anglePenalty - min(50, pixelErr×1.5)` |
| `radarScore(n, c)` | レーダーの単一軸スコア `min(100, n×15 + c×0.5)` |
| `methodScores(results)` | 4手法のレーダーチャートスコア |
| `rankPins(pins, results)` | 候補PINの合計スコア（`RANK_WEIGHTS` を使用） |
| `hintLevel(scores)` | 平均スコアから `'high'` / `'mid'` / `'low'` を返す |

スコアの重みは `RANK_WEIGHTS` としてエクスポート済みで、変更時はテストも
同時に更新します。

---

## レーダーチャート描画 - High DPI対応

### High DPIキャンバス初期化

Retina / 4K ディスプレイでキャンバスの文字がぼやけないよう、`devicePixelRatio` を掛けた
実ピクセルサイズをキャンバスの `width` / `height` に設定し、描画コンテキスト側で
`scale(dpr, dpr)` を一度だけ呼びます。

```javascript
function setupHighDPICanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // CSS 上の表示サイズ
  const displayWidth = rect.width;
  const displayHeight = rect.height;

  // 実ピクセルサイズ（DPR 倍）
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;

  return {displayWidth, displayHeight, dpr};
}
```

```javascript
radarCtx = radarCanvas.getContext('2d');
radarCtx.scale(radarDims.dpr, radarDims.dpr);
```

これにより、描画コードは CSS 座標系（`displayWidth` / `displayHeight`）のまま書けて、
内部的に DPR 倍されるため、高解像度ディスプレイで鮮明に表示されます。

### レーダーチャート幾何学

4 軸（指紋・熱・音響・盗撮）の値を上向きを 0 度として極座標 → デカルト座標に変換して描きます。

```javascript
const labels = ['指紋', '熱', '音響', '盗撮'];
const values = [scores.finger, scores.thermal, scores.audio, scores.video];
const angles = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
```

座標変換:

```javascript
// 数学的な 0 度は右向き。上向きを基準にするため -π/2 する
const angle = angles[i] - Math.PI / 2;

// 極座標 → デカルト座標
const x = cx + Math.cos(angle) * radius * score;
const y = cy + Math.sin(angle) * radius * score;
```

### 描画順序

奥から手前へ、次の順で描きます。

1. 背景の同心円（5 段階、スコア 20・40・60・80・100 の目盛り）
2. 軸線（4 本）
3. ラベルテキスト（軸の外側）
4. データポリゴン（半透明塗り）
5. データポリゴン（枠線）
6. データポイント（頂点の円）

### prefers-reduced-motion への配慮

`style.css` 側で `@media (prefers-reduced-motion: reduce)` を定義し、
アニメーションを縮約する環境ではチャートのトランジションも最小化します。

---

## 熱解析 - 指数減衰シミュレーション

### 物理モデル

```
T(t) = T₀ × e^(-t/τ)

T₀: 初期温度
t : 経過時間（秒）
τ : 時定数（既定 20 秒）
```

実装は `pin-engine.js:thermalDecay(initial, elapsed, tau = 20)`。純関数で、
副作用もタイマー状態も持ちません。

```javascript
export function thermalDecay(initial, elapsed, tau = 20){
  const t0 = Math.max(0, Number(initial) || 0);
  const t = Math.max(0, Number(elapsed) || 0);
  return Math.max(0, t0 * Math.exp(-t / tau));
}
```

### 画面側の減衰

画面側（`script.js`）は 1 秒ごとにエンジンの `thermalDecay(T₀, t, τ=20)` を呼んで描画を更新し、
解析ボタンで減衰を停止して、その時点の温度で順序を推定します。
UI の冷却カーブはエンジンの指数減衰モデルと同じ式で、計算と表示が一致します。

数値の例:

| 初期温度 T₀ | 経過時間 t | 残り温度 T(t) |
| --- | --- | --- |
| 40 ℃ | 0 秒 | 40 ℃ |
| 40 ℃ | 10 秒 | 24.26 ℃ |
| 40 ℃ | 20 秒 | 14.72 ℃ |
| 40 ℃ | 40 秒 | 5.41 ℃ |
| 40 ℃ | 60 秒 | 1.99 ℃ |

### リアルタイム減衰のタイマー制御

```javascript
function startThermalDecay(){
  if(thermalDecayInterval) clearInterval(thermalDecayInterval);

  thermalStartTime = Date.now();

  thermalDecayInterval = setInterval(() => {
    const elapsed = (Date.now() - thermalStartTime) / 1000;
    if(elapsed >= 60){
      clearInterval(thermalDecayInterval);
      return;
    }
    // スライダー・テキスト・キャンバスを更新
  }, 100);
}
```

- `Date.now()` で実時間を計測し、タイマーの累積誤差を回避
- 60 秒経過で自動停止（教材として長時間放置する意味がないため）
- 100ms 間隔で滑らかなアニメーション

### カラーマッピング

温度を HSL の Hue に線形マッピングして色付けします。

```javascript
const ratio = Math.min(1, temp / 40); // 0〜40℃ を 0〜1 に正規化
const hue = (1 - ratio) * 240;         // 240°（青） → 0°（赤）
ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
```

- 低温（0℃）: Hue 240° = 青
- 高温（40℃）: Hue 0° = 赤
- 中間はなめらかな青→緑→黄→赤の遷移

HSL を使うことで、1 本の `fillStyle` 代入で意味のある補間が得られます。
RGB で同じことをするには中間色のテーブルが必要で、保守性で劣ります。

---

## 音響解析 - ピーク検出アルゴリズム

### 二重閾値クロッシング

```javascript
export function countPeaks(data, {rise = 0.3, fall = 0.1, stride = 200} = {}){
  if(!data || typeof data.length !== 'number' || data.length === 0) return 0;
  let peaks = 0, inPeak = false;
  for(let i = 0; i < data.length; i += stride){
    const v = Math.abs(data[i]);
    if(!inPeak && v > rise){ peaks++; inPeak = true; }
    else if(inPeak && v < fall){ inPeak = false; }
  }
  return peaks;
}
```

- 立ち上がり閾値 `rise = 0.3`、立ち下がり閾値 `fall = 0.1`
- `rise` を超えたらピーク発生、`fall` を下回ったらピーク終了
- サンプリングステップ `stride = 200`（44.1 kHz 音源で約 4.5 ms ごと）
- 入力は `Float32Array` などの配列ライク。空配列や `null` は 0 を返す

### 単一閾値ではなく二重閾値を使う理由

単一閾値（例: 0.3 のみ）だと、閾値付近を細かく上下する波形で 1 回の打鍵が
複数回のピークとして数えられる「チャタリング」が起きます。
二重閾値（ヒステリシス）にすると、

- `0.3` を超えて「ピーク中」になる
- `0.1` を下回ってはじめて「ピーク終了」になる

という状態機械になり、1 回の打鍵は確実に 1 ピークとしてカウントされます。
電子回路のシュミットトリガと同じ考え方です。

### サンプリングステップの効果

```
全サンプル処理:  O(n)、n = 44,100 × 秒数
ストライド処理:  O(n / 200)、約 200 倍の高速化
```

打鍵音の立ち上がり・立ち下がりは数ミリ秒〜数十ミリ秒のオーダーなので、
4.5 ms おきにサンプルすれば十分に捕捉できます。

### 画面側の制約

```javascript
const AUDIO_MAX_BYTES = 20 * 1024 * 1024; // 20MB cap for acoustic analysis
```

- ファイルサイズ上限 20 MB（超えたらエラー表示）
- `AudioContext` は decode の成功・失敗どちらの経路でも `.close()` を呼び、
  デコード済みバッファの解放を促す
- `window.AudioContext || window.webkitAudioContext` のフォールバックで
  古い Safari にも配慮

### 閾値 0.3 / 0.1 の根拠

- `rise = 0.3`: 一般的な打鍵音の立ち上がり振幅。背景ノイズ（通常 < 0.1）を除外しつつ、
  強い打鍵音（> 0.5）も確実に拾う
- `fall = 0.1`: 背景ノイズのレベル。ピーク終了をここで判定することで、
  打鍵音の余韻を 1 ピークに閉じ込める

これらの数値は `PEAK_DEFAULTS` としてエクスポートされており、
`test/readme.test.js` は README と TECHNICAL.md がこの数値と一致していることを検査します。

---

## PINランキング - 複合スコアリング

### 組み合わせ生成

バックトラッキングで候補を生成し、上限 100 に達したら即時終了します。
`4^4 = 256` 通りのうち、辞書順の最初の 100 通りに制限する形です。

```javascript
const maxGenerate = 100;

function generateCombinations(arr, len, prefix = ''){
  if(prefix.length === len){
    pins.push(prefix);
    return;
  }
  if(pins.length >= maxGenerate) return;

  for(const d of arr){
    generateCombinations(arr, len, prefix + String(d));
    if(pins.length >= maxGenerate) break;
  }
}

generateCombinations(candidates, length);
```

計算量制御:

- 候補数 4 個 × 桁数 4 の場合: 全列挙は 256 通り → 100 通りに制限
- 候補数 10 個 × 桁数 4 の場合: 全列挙は 10,000 通り → 100 通りで打ち切り
- 教材として表示する TOP10 を得るのに、256 通り全部を生成する必要はない

### 複合スコアリングモデル

生成された各候補 PIN に対して、攻撃手法の結果と照らし合わせてスコアを付けます。

```javascript
const scored = pins.map(pin => {
  let score = 0;

  // 1. 熱解析の順序一致（最重要）
  if(results.thermal && results.thermal.candidates){
    const thermalOrder = results.thermal.candidates;
    for(let i = 0; i < Math.min(pin.length, thermalOrder.length); i++){
      if(pin[i] === thermalOrder[i]) score += 15; // +15pt/桁
    }
  }

  // 2. 指紋解析の検出
  if(results.finger){
    const fingerSet = new Set(results.finger);
    for(const d of pin){
      if(fingerSet.has(d)) score += 8; // +8pt/桁
    }
  }

  // 3. 盗撮解析の検出
  if(results.video && results.video.candidates){
    const videoSet = new Set(results.video.candidates);
    for(const d of pin){
      if(videoSet.has(d)) score += 10; // +10pt/桁
    }
  }

  // 4. 共通パターンのペナルティ
  if(/^(\d)\1+$/.test(pin)) score -= 20;              // 同一数字: -20pt
  if(pin === '1234' || pin === '0000') score -= 10;   // よくあるPIN: -10pt

  return {pin, score};
});
```

スコアリングの重み付け根拠:

| 要素 | 重み | 理由 |
| --- | --- | --- |
| 熱解析の順序一致（桁ごと） | +15 pt | 順序情報を持つため最高スコア |
| 盗撮解析で検出された数字 | +10 pt / 桁 | 視覚的確認のため高信頼 |
| 指紋解析で検出された数字 | +8 pt / 桁 | 順序情報なし、やや低信頼 |
| すべて同じ数字（例 `1111`） | -20 pt | セキュリティ教育的観点のペナルティ |
| `1234` / `0000` | -10 pt | 典型的な弱い PIN へのペナルティ |

### ソートと表示

```javascript
return scored.sort((a, b) => b.score - a.score).slice(0, 10);
```

降順ソートして上位 10 件を返し、画面で表示します。
同点のときの順序はソートの安定性にゆだねます（教材用途であり、
厳密な順序が結論に影響する場面ではないため）。

---

## 手で隠すモード - 永続的マスキング

### 状態管理

```javascript
let handCoverInput = [];       // 実際の入力配列
let handCoverMode = false;     // モードの ON/OFF
let handCoverStartIndex = 0;   // マスキング開始位置
let maskedIndices = new Set(); // 永続的にマスクされたインデックス
```

4 つの状態を分けている理由:

- `handCoverInput`: ユーザが押した実際の値。表示とは分離
- `handCoverMode`: 現在のモード状態
- `handCoverStartIndex`: ON にした瞬間の桁数。それ以前の桁は保護対象外
- `maskedIndices`: 一度マスクされた桁の集合。モードを OFF にしても保持

### 永続的マスキングロジック

```javascript
function updateHandCoverDisplay(showBriefly, digit){
  const displayEl = el('hand-cover-input');

  if(showBriefly && digit){
    // モード ON 時: 一時的に見せてからマスク
    const currentIndex = handCoverInput.length - 1;

    // 一時表示: マスク済み以外を表示
    let display = '';
    for(let i = 0; i < handCoverInput.length; i++){
      if(maskedIndices.has(i)) display += '*';
      else if(i === currentIndex) display += digit;
      else display += handCoverInput[i];
    }
    displayEl.textContent = display;

    // 300ms 後に永続マスク
    setTimeout(() => {
      maskedIndices.add(currentIndex);
      let d = '';
      for(let i = 0; i < handCoverInput.length; i++){
        d += maskedIndices.has(i) ? '*' : handCoverInput[i];
      }
      displayEl.textContent = d;
    }, 300);
  } else {
    // モード OFF 時: マスク済みはそのまま
    let display = '';
    for(let i = 0; i < handCoverInput.length; i++){
      display += maskedIndices.has(i) ? '*' : handCoverInput[i];
    }
    displayEl.textContent = display;
  }
}
```

### 動作フロー

シナリオ: `1234` → モード ON → `5` → モード OFF → `6`

1. 初期入力（`1234`）:

   ```javascript
   handCoverInput = ['1','2','3','4']
   maskedIndices = Set()
   display = "1234"
   ```

2. モード ON:

   ```javascript
   handCoverMode = true
   handCoverStartIndex = 4
   // 表示は変わらない
   ```

3. `5` を入力:

   ```javascript
   handCoverInput = ['1','2','3','4','5']

   // 即座に表示
   display = "12345"

   // 300ms 後
   maskedIndices = Set(4)
   display = "1234*"
   ```

4. モード OFF:

   ```javascript
   handCoverMode = false
   maskedIndices = Set(4)  // 変わらない
   display = "1234*"        // 変わらない
   ```

5. `6` を入力:

   ```javascript
   handCoverInput = ['1','2','3','4','5','6']
   maskedIndices = Set(4)   // 5 だけマスク
   display = "1234*6"
   ```

### Set データ構造の利用理由

```javascript
let maskedIndices = new Set();
```

利点:

- `O(1)` での存在チェック: `maskedIndices.has(i)`
- 重複を自動排除
- `add()`, `clear()` の直感的な API

配列との比較:

```javascript
// 配列の場合（非効率）
if(maskedIndicesArray.includes(i))  // O(n)

// Set の場合（効率的）
if(maskedIndices.has(i))           // O(1)
```

PIN の桁数は現実的には 8 以下なので、`O(n)` でも実用上は困りません。
ただし意図（「このインデックスは特別扱い」）が Set のほうが明快に表せるため採用しています。

### クリアと初期化

「クリア」ボタンでは、`handCoverInput` と `maskedIndices` の両方を空にし、
`handCoverStartIndex` を 0 に戻します。モード自体はクリアでは変更しません。

---

## テストとCI

- `npm test`（`node --test`、依存なし）
- テスト構成:
  - `test/engine.test.js`: 期待値 15 件 + 総当たり参照実装による多ケース照合
  - `test/i18n.test.js`: `script.js` に日本語リテラル 0 件
  - `test/html.test.js`: CSP meta、favicon、noscript、`type="module"`、
    インラインハンドラー / style 属性なし、主要 id の実在
  - `test/contrast.test.js`: ライト・ダーク両方で主要の文字 / 背景の組が WCAG AA 4.5:1 以上
  - `test/format.test.js`: 行長と主要ファイルの行数下限
  - `test/readme.test.js`: README の計算例・画像参照・YAML・禁止語、
    各 H2 節の太字が 2 か所以下、箇条書き先頭の `- **` 禁止、
    TECHNICAL.md の音響閾値（rise=0.3, fall=0.1）が `PEAK_DEFAULTS` と一致
- CI: `.github/workflows/test.yml` が push と pull_request で Node 22 の `npm test` を実行

### ローカル確認

```bash
npm test
python -m http.server 8099    # file:// では module が動かないため HTTP で配信する
```

### 総当たり参照実装

`test/engine.test.js` は、小さなサイズでは全列挙する素直な参照実装を別に用意して、
`computeCandidates` の返す件数と候補集合を照合します。
期待値 15 件は手計算で得たもので、参照実装とエンジンの両方がそれに一致することを確かめます。

---

## パフォーマンス最適化

### 1. イベント委譲

```javascript
function createKeypad(containerId, onClickCallback){
  const container = el(containerId);
  const keys = [];

  fingerKeys.forEach((label, i) => {
    const btn = document.createElement('div');
    btn.className = 'key';
    btn.textContent = label;
    btn.dataset.index = i;
    btn._label = label;
    keys.push(btn);
    container.appendChild(btn);
  });

  // コンテナに 1 つのリスナーのみ
  container.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if(key && onClickCallback) onClickCallback(key);
  });

  return keys;
}
```

利点:

- 12 個のキーに対してリスナーは 1 個のみ
- メモリ使用量削減
- 動的に要素を追加・削除しても再登録不要

### 2. キャンバス再描画の最適化

```javascript
function drawThermal(){
  ctx.clearRect(0, 0, w, h);  // 全体を一度にクリア

  // 塗り
  for(let i = 0; i < 12; i++){
    const row = Math.floor(i / 3);
    const col = i % 3;
    const x = col * keyW;
    const y = row * keyH;

    const ratio = temps[i] / 40;
    const hue = (1 - ratio) * 240;

    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(x, y, keyW, keyH);
  }

  // 枠線は別ループ（fillStyle の変更回数を削減）
  ctx.strokeStyle = '#fff';
  // ...
}
```

最適化ポイント:

- `clearRect` で全体を一度にクリア（個別クリアより高速）
- `fillStyle` / `strokeStyle` の切り替えを塗りと枠線で分離
- 座標計算はループ内で完結（事前テーブル不要）

### 3. 計算の最適化（二項係数）

```javascript
export function binom(n, k){
  if(k < 0 || k > n) return 0;
  k = Math.min(k, n - k);   // 対称性で反復回数を半減
  let res = 1;
  for(let i = 1; i <= k; i++){
    res = res * (n - (k - i)) / i;
  }
  return Math.round(res);
}
```

計算量:

- 再帰版 `C(n,k) = C(n-1,k-1) + C(n-1,k)`: `O(2^min(k, n-k))`
- 反復版（本実装）: `O(min(k, n-k))`

### 4. DOM 操作のバッチ化

計算ステップの表示は、1 行ごとに `textContent +=` するのではなく、
各行を `createElement('div')` で作ってから `appendChild` することで
リフロー回数を減らします。より大規模な出力なら `DocumentFragment` の採用が
さらに有効です。

```javascript
stepsEl.innerHTML = '';
steps.forEach((step, idx) => {
  const line = document.createElement('div');
  line.className = 'step-line';
  line.textContent = `${idx + 1}. ${step}`;
  stepsEl.appendChild(line);
});
```

### 5. 遅延評価と候補列挙の制限

```javascript
export function generateCombinations(alphabet, n, cap){
  if(Math.pow(alphabet.length, n) > cap) return null;
  // ...（上限超過なら null を返して呼び出し側が count のみを表示）
}
```

- `10^10 = 10,000,000,000` 通りの全列挙を回避
- モード別上限（allowed/must = 5000、partial = 500）で停止
- 表示は 1,000 件まで、それ以上は CSV エクスポート

### 6. AudioContext のライフサイクル管理

音声ファイルを decode したあとは `AudioContext.close()` を呼び、
デコード済みバッファとオーディオスレッドを解放します。
`try` / `catch` / `finally` で、エラー経路でも `close` が呼ばれるようにします。

```javascript
const ctx = new (window.AudioContext || window.webkitAudioContext)();
try {
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  const peaks = countPeaks(buffer.getChannelData(0));
  // ...
} finally {
  if(ctx.state !== 'closed') ctx.close();
}
```

---

## 開発時の注意点

### 1. データ構造の一貫性

攻撃結果の構造を統一します。手法によって「配列」「オブジェクト」「数値」と形が違うのは
意味のある区別（指紋は数字集合、熱は順序付き、音響は桁数のみ、盗撮は数字＋信頼度）です。

```javascript
window._attackResults = {
  finger: ['1', '2', '3'],                             // 配列
  thermal: {candidates: [...], orderConfidence: 85},   // オブジェクト
  audio: 4,                                            // 数値
  video: {candidates: [...], confidence: 88},          // オブジェクト
};
```

### 2. 浮動小数点演算の注意

```javascript
// 悪い例: 中間結果でオーバーフローや丸め誤差が生じやすい
const result = (n * k) / m;

// 良い例: 乗除を分けて逐次正規化
let result = n;
result *= k;
result /= m;
result = Math.round(result);
```

二項係数の反復式は、乗算と除算を交互に行うことで中間値を小さく保ちます。
`Math.round` は最後に 1 度だけ呼べば、浮動小数点誤差を整数に丸められます。

### 3. CSP への配慮

`index.html` の CSP meta は `default-src 'self'; script-src 'self'; style-src 'self'; ...` と
厳しく設定されています。新しい機能を追加するときは、

- インラインスクリプトを書かない（`onclick=` などの属性ハンドラーも禁止）
- インラインスタイル属性を書かない（`style="..."` を属性に書かない。クラスで切り替える）
- 外部 CDN から読み込まない（CSS もスクリプトも、画像もフォントも）

を守ってください。`test/html.test.js` がこれらを検査します。

### 4. 文言の集中管理

画面に出る日本語の文言は `pts-messages.js` に集めます。`script.js` に日本語の
文字列リテラルを直接書かないこと（`test/i18n.test.js` が検査します）。
将来の多言語化のための前提でもあります。

### 5. モジュール読み込みと `file://`

`script.js` は `type="module"` で読み込まれるため、`file://` では動きません。
開発時は `python -m http.server 8099` などで HTTP 配信してください。

### 6. アクセシビリティ

- `prefers-reduced-motion` を尊重し、アニメーションを縮約する
- 文字コントラストは WCAG AA（4.5:1）以上
- 入力欄のフォントサイズは 16px 以上（iOS のズーム抑止）
- 320px 幅でも破綻しないレイアウト

---

## 今後の拡張可能性

### 1. 新しい攻撃手法の追加

追加手順:

1. `window._attackResults` に新しいキーを追加
2. UI（`index.html`）に解析カードを追加
3. 解析ロジックを `script.js` に実装（純粋ロジックは `pin-engine.js` へ）
4. `simRun()` 内で結果を統合
5. `generatePINRanking()` のスコアリングに追加
6. 文言は `pts-messages.js` に辞書追加
7. テスト: 期待値を `test/engine.test.js` に、文言を `test/i18n.test.js` に

例: 磁気センサー攻撃（スマートフォンの地磁気センサーから指の動きを推定）

```javascript
window._attackResults.magnetic = {
  candidates: ['2', '5', '8'],
  confidence: 65,
};

// スコアリング
if(results.magnetic && results.magnetic.candidates){
  const magneticSet = new Set(results.magnetic.candidates);
  for(const d of pin){
    if(magneticSet.has(d)) score += 7;
  }
}
```

### 2. 候補集合計算の高速化

現在は最大 `n = 8` 桁、`|S| ≤ 10` を想定しており、
`A^f` は最大でも `10^8 = 100,000,000` 通りです。
`ENUM_CAPS` で早期打ち切りしているため実用上は十分ですが、
より一般的な設定への拡張を見据えると、

- 必須包含モードの包除原理をメモ化する
- 列挙の順序を再定義して、固定桁の位置に依存した枝刈りを行う

といった最適化余地があります。

### 3. 多言語化

`pts-messages.js` は現在 `ja` 辞書のみですが、`en` を追加できる構造にしています。
`t(key, params)` の呼び出し側を書き直す必要はなく、辞書を増やすだけで切り替えられます。

```javascript
export const messages = {
  ja: { 'result.count': '{n} 通り', /* ... */ },
  en: { 'result.count': '{n} patterns', /* ... */ },
};
```

### 4. Web Workers による並列化

大量の候補列挙や音声デコードを UI スレッドから分離できます。

```javascript
// メインスレッド
const worker = new Worker('audio-worker.js', {type: 'module'});
worker.postMessage({arrayBuffer});
worker.onmessage = (e) => {
  const peaks = e.data;
  renderResult(peaks);
};

// audio-worker.js
import {countPeaks} from './pin-engine.js';
self.onmessage = async (e) => {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(e.data.arrayBuffer);
    self.postMessage(countPeaks(buf.getChannelData(0)));
  } finally {
    ctx.close();
  }
};
```

### 5. 新しい計算モードの追加

モードは 3 つに限りません。例として「禁止集合モード」（S に含まれる数字を使えない）
などが考えられます。追加には:

1. `pin-engine.js:computeCandidates` に新しい分岐
2. `index.html` のモード選択セレクトに項目追加
3. `pts-messages.js` に説明文を追加
4. `test/engine.test.js` に期待値を追加

### 6. 統計モデルの導入

現在のスコアリングは手動の重み付けですが、実環境のデータから
重みを学習することも考えられます。ただし本ツールの位置づけは
教育用であり、学習済みモデルを導入すると「どういう根拠でこの重みか」
が説明しにくくなります。導入する場合は、重みの由来とデータソースを
TECHNICAL.md に明記するのが前提になります。

---

## 参考文献・関連技術

### 数学的背景

1. 包除原理（Inclusion-Exclusion Principle）
   - 用途: 必須包含モードの候補数計算
   - 参考: [Wikipedia - Inclusion-exclusion principle](https://en.wikipedia.org/wiki/Inclusion%E2%80%93exclusion_principle)

2. 二項係数（Binomial Coefficient）
   - 用途: 包除原理の係数、組み合わせ数
   - 公式: `C(n,k) = n! / (k!(n-k)!)`
   - 参考: [Wikipedia - Binomial coefficient](https://en.wikipedia.org/wiki/Binomial_coefficient)

3. 指数減衰（Exponential Decay）
   - 用途: 熱解析の時間変化モデル
   - 公式: `T(t) = T₀ × e^(-t/τ)`
   - 参考: [Wikipedia - Exponential decay](https://en.wikipedia.org/wiki/Exponential_decay)

### Web 技術

1. Canvas API: High DPI 対応
   - `devicePixelRatio` による高解像度描画
   - 参考: [MDN - Canvas API](https://developer.mozilla.org/ja/docs/Web/API/Canvas_API)

2. Web Audio API: 音声解析
   - `AudioContext`, `decodeAudioData` による波形処理
   - 参考: [MDN - Web Audio API](https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API)

3. ES Modules
   - `type="module"` で `pin-engine.js` と `pts-messages.js` を読み込む
   - 参考: [MDN - JavaScript modules](https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Modules)

4. Set データ構造: 効率的な集合演算
   - `O(1)` での存在チェック
   - 参考: [MDN - Set](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Set)

### アルゴリズム

1. バックトラッキング: 組み合わせ生成
   - 深さ優先探索による全列挙
   - 参考: [Wikipedia - Backtracking](https://en.wikipedia.org/wiki/Backtracking)

2. ピーク検出: 信号処理（ヒステリシス付き閾値クロッシング）
   - 二重閾値による chattering 回避
   - 参考: [Wikipedia - Schmitt trigger](https://en.wikipedia.org/wiki/Schmitt_trigger)

3. HSL カラーモデル: 温度マッピング
   - 色相（Hue）を温度に線形対応
   - 参考: [MDN - HSL colors](https://developer.mozilla.org/ja/docs/Web/CSS/color_value/hsl)

### セキュリティ関連

1. Content Security Policy (CSP)
   - 本ツールは `default-src 'self'` を基本に、外部読み込みを一切許可しない
   - 参考: [MDN - CSP](https://developer.mozilla.org/ja/docs/Web/HTTP/CSP)

2. WCAG コントラスト基準
   - 本ツールはライト／ダーク両方で 4.5:1 以上を満たす
   - 参考: [W3C - WCAG 2.1 Contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

---

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## 著者

ipusiron - [GitHub](https://github.com/ipusiron)

## プロジェクト

**生成AIで作るセキュリティツール100** - Day088
