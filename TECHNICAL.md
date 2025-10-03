# TECHNICAL.md

開発者向けテクニカルドキュメント - PIN Threat Simulator

このドキュメントでは、本ツールの技巧的な実装、複雑な仕組み、コアなロジック、工夫している部分について解説します。

---

## 目次

1. [PINパターン計算エンジン](#pinパターン計算エンジン)
2. [攻撃シミュレーション - 信頼度モデル](#攻撃シミュレーション---信頼度モデル)
3. [レーダーチャート描画 - High DPI対応](#レーダーチャート描画---high-dpi対応)
4. [熱解析 - 指数減衰シミュレーション](#熱解析---指数減衰シミュレーション)
5. [音響解析 - ピーク検出アルゴリズム](#音響解析---ピーク検出アルゴリズム)
6. [PINランキング - 複合スコアリング](#pinランキング---複合スコアリング)
7. [手で隠すモード - 永続的マスキング](#手で隠すモード---永続的マスキング)
8. [パフォーマンス最適化](#パフォーマンス最適化)

---

## PINパターン計算エンジン

### 概要

本ツールの核となる組み合わせ論エンジン。3つのモード（制約ベース、必須ベース、部分指定ベース）で候補数を計算します。

### 実装場所

`script.js:480-686` - `computeCandidates()` 関数

### 1. 制約ベース（Allowed Mode）

**用途**: 「これらの数字だけを使う」という制約

**計算式**:
```javascript
// 重複あり
count = A^n

// 重複なし
count = P(A, n) = A! / (A-n)!
```

**実装の工夫**:
```javascript
// 階乗の直接計算を避け、反復計算で精度を保つ
let count = 1;
for(let i = 0; i < length; i++){
  count *= (alphabet - i);
}
```

**理由**: `Math.pow()`よりも大きな数値での精度が高く、中間結果のオーバーフローを防ぐ

### 2. 必須ベース（Must Mode）

**用途**: 「これらの数字を必ず含む」という制約

**数学的背景**: 包除原理（Inclusion-Exclusion Principle）

**計算式**:
```
count = Σ(i=0 to k) (-1)^i × C(k,i) × (A-i)^n
```

where:
- `A`: 全アルファベットサイズ（通常10）
- `k`: 必須数字の個数
- `n`: PINの桁数
- `C(k,i)`: 二項係数

**実装** (script.js:565-586):
```javascript
let total = 0;
for(let i = 0; i <= mustDigits.length; i++){
  const sign = (i % 2 === 0) ? 1 : -1;
  const binom = binomial(mustDigits.length, i);
  const base = alphabetSize - i;
  const power = Math.pow(base, length);
  total += sign * binom * power;
}
```

**二項係数の計算** (script.js:622-638):
```javascript
function binomial(n, k){
  if(k > n) return 0;
  if(k === 0 || k === n) return 1;

  k = Math.min(k, n - k); // 対称性を利用して計算量削減

  let result = 1;
  for(let i = 0; i < k; i++){
    result *= (n - i);
    result /= (i + 1);
    result = Math.round(result); // 浮動小数点誤差を回避
  }
  return result;
}
```

**工夫点**:
- 対称性 `C(n,k) = C(n,n-k)` を利用して計算量を半減
- 乗算と除算を交互に実行して中間結果のオーバーフローを防止
- `Math.round()` で浮動小数点誤差を補正

### 3. 部分指定ベース（Partial Mode）

**用途**: ワイルドカード `*` を使った部分的なPIN指定（例: `12**`）

**実装** (script.js:640-662):
```javascript
const wildcardCount = partial.split('').filter(c => c === '*').length;

if(dupAllowed){
  count = Math.pow(10, wildcardCount); // 10^w
} else {
  const fixedDigits = new Set(partial.replace(/\*/g, '').split(''));
  const availableDigits = 10 - fixedDigits.size;

  // 順列計算: P(available, wildcards)
  let count = 1;
  for(let i = 0; i < wildcardCount; i++){
    count *= (availableDigits - i);
  }
}
```

**特徴**:
- ワイルドカード数を数えるだけでなく、すでに使用された数字を除外
- 重複なしの場合、利用可能な数字から順列を計算

### 候補列挙（Full Enumeration）

候補数が一定数以下の場合、すべての組み合わせを実際に生成します。

**生成上限（モード別）**:
- 許容集合モード: 5000通りまで生成
- 必須包含モード: 3000通りまで生成
- 部分特定モード: 500通りまで生成
- **表示上限**: 1000件まで画面表示（それ以上はCSVエクスポートで取得可能）

**実装** (script.js:549-561, 594-606, 677):
```javascript
function enumerateAllowed(digits, length, allowDup){
  const result = [];

  function backtrack(current){
    if(current.length === length){
      result.push(current);
      return;
    }
    for(const d of digits){
      if(!allowDup && current.includes(d)) continue;
      backtrack(current + d);
    }
  }

  backtrack('');
  return result;
}
```

**最適化**:
- バックトラッキングによる再帰的生成
- 重複チェックを `includes()` で効率的に実行
- 結果を文字列として構築（配列操作より高速）

---

## 攻撃シミュレーション - 信頼度モデル

### 盗撮解析の信頼度計算

**実装場所**: `script.js:925-963`

### 信頼度計算式

```javascript
confidence = 100 - anglePenalty - errorPenalty

where:
  anglePenalty = (angle === 'tilt') ? 30 : 0
  errorPenalty = min(50, pixelErr × 1.5)
```

### 検出数削減モデル

**視点角度による削減**:
```javascript
if(videoAngle === 'tilt'){
  const accuracy = Math.max(0.5, 1 - pixelErr/50);
  const detectedCount = Math.ceil(candidates.length * accuracy);
  candidates = candidates.slice(0, detectedCount);
}
```

**数学モデル**:
```
accuracy(err) = max(0.5, 1 - err/50)

例:
  err = 0px  → accuracy = 100%
  err = 8px  → accuracy = 84%
  err = 25px → accuracy = 50% (下限)
  err = 50px → accuracy = 50% (下限)
```

**ピクセル誤差による削減**:
```javascript
if(pixelErr > 20){
  candidates = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
}
```

### データ構造

**新しいフォーマット** (script.js:960):
```javascript
window._attackResults.video = {
  candidates: ['1', '2', '3', '4'],  // 検出された数字
  confidence: 88                      // 信頼度 (0-100)
};
```

### スコア計算への統合

**レーダーチャートスコア** (script.js:995):
```javascript
video: results.video
  ? Math.min(100, results.video.candidates.length × 15 + results.video.confidence × 0.5)
  : 0
```

**スコア計算の意図**:
- 検出数が主要因子（15倍の重み）
- 信頼度は補助的要素（0.5倍の重み）
- 4桁全検出 + 信頼度100% = 110点 → 100点（上限クランプ）

---

## レーダーチャート描画 - High DPI対応

### 実装場所

`script.js:114-223`

### High DPIキャンバス初期化

**問題**: Retina/4Kディスプレイでキャンバスがぼやける

**解決策** (script.js:119-130):
```javascript
function setupHighDPICanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // CSS表示サイズ
  const displayWidth = rect.width;
  const displayHeight = rect.height;

  // 実際のピクセルサイズ（DPR倍）
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;

  return {displayWidth, displayHeight, dpr};
}
```

**コンテキストのスケーリング** (script.js:141-142):
```javascript
radarCtx = radarCanvas.getContext('2d');
radarCtx.scale(radarDims.dpr, radarDims.dpr);
```

**描画時の座標系**:
- 描画コードはCSS座標系（displayWidth/Height）を使用
- 内部的にDPR倍されるため、高解像度ディスプレイで鮮明に表示

### レーダーチャート幾何学

**4軸レーダーチャート** (script.js:169-171):
```javascript
const labels = ['指紋', '熱', '音響', '盗撮'];
const values = [scores.finger, scores.thermal, scores.audio, scores.video];
const angles = [0, Math.PI/2, Math.PI, Math.PI*3/2];
```

**座標変換** (script.js:180-181, 198-201):
```javascript
// 角度を上向き基準に変換（数学的な0度は右向き）
const angle = angles[i] - Math.PI/2;

// 極座標 → デカルト座標
const x = cx + Math.cos(angle) * radius * score;
const y = cy + Math.sin(angle) * radius * score;
```

**描画順序**（奥から手前へ）:
1. 背景の同心円（5段階）
2. 軸線（4本）
3. ラベルテキスト
4. データポリゴン（塗り）
5. データポリゴン（枠線）
6. データポイント（円）

---

## 熱解析 - 指数減衰シミュレーション

### 実装場所

`script.js:272-361`

### 物理モデル

**温度減衰式**:
```
T(t) = T₀ × e^(-t/τ)

where:
  T₀: 初期温度
  t:  経過時間（秒）
  τ:  時定数（decay constant = 20秒）
```

**実装** (script.js:344-348):
```javascript
const dec = 20; // decay constant in seconds
baseTemps.forEach((t, i) => {
  const decayedTemp = t * Math.exp(-elapsed / dec);
  temps[i] = Math.max(0, decayedTemp);
});
```

### リアルタイム減衰

**自動更新メカニズム** (script.js:278-290):
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
    el('thermal-slider').value = elapsed;
    el('thermal-time').textContent = Math.floor(elapsed);
    drawThermal();
  }, 100); // 100msごとに更新
}
```

**工夫点**:
- `Date.now()` で実時間を計測（タイマーの累積誤差を防ぐ）
- 60秒で自動停止
- 100ms間隔で滑らかなアニメーション

### カラーマッピング

**温度→色変換** (script.js:330-333):
```javascript
const ratio = temp / 40; // 0-40度を0-1に正規化
const hue = (1 - ratio) * 240; // 240(青) → 0(赤)
ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
```

**HSLカラーモデルの利用**:
- Hue 240° = 青（冷たい）
- Hue 0° = 赤（熱い）
- 線形補間で滑らかなグラデーション

---

## 音響解析 - ピーク検出アルゴリズム

### 実装場所

`script.js:869-910`

### AudioContext処理

**音声ファイルのデコード** (script.js:878-882):
```javascript
const arrayBuffer = await file.arrayBuffer();
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
const rawData = audioBuffer.getChannelData(0); // モノラル化
```

### ピーク検出アルゴリズム

**閾値ベース検出** (script.js:884-903):
```javascript
function detectPeaks(data, threshold = 0.3){
  let peaks = 0;
  let inPeak = false;

  const stride = 200; // サンプリング間隔（パフォーマンス最適化）

  for(let i = 0; i < data.length; i += stride){
    const abs = Math.abs(data[i]);

    if(abs > threshold && !inPeak){
      peaks++;
      inPeak = true;
    } else if(abs <= threshold){
      inPeak = false;
    }
  }

  return peaks;
}
```

**アルゴリズムの特徴**:
1. **閾値クロッシング検出**: 振幅が閾値を超えた瞬間をピークとしてカウント
2. **ピーク状態管理**: `inPeak` フラグで連続するピークを1回だけカウント
3. **ストライド最適化**: 200サンプルごとに評価（44.1kHz音源で約4.5msごと）

**パフォーマンス比較**:
```
全サンプル処理: O(n)、n = 44100 × 秒数
ストライド処理: O(n/200)、約220倍高速
```

### 閾値の根拠

```javascript
threshold = 0.3  // 正規化された振幅（-1.0 ~ 1.0）
```

- **0.3**: 一般的な打鍵音の平均振幅
- 背景ノイズ（通常 < 0.1）を除外
- 強い打鍵音（> 0.5）も確実に検出

---

## PINランキング - 複合スコアリング

### 実装場所

`script.js:1083-1141`

### 組み合わせ生成

**バックトラッキングアルゴリズム** (script.js:1089-1099):
```javascript
function generateCombinations(arr, len, prefix=''){
  if(prefix.length === len){
    pins.push(prefix);
    return;
  }
  if(pins.length >= maxGenerate) return; // 早期終了

  for(const d of arr){
    generateCombinations(arr, len, prefix + String(d));
    if(pins.length >= maxGenerate) break;
  }
}
```

**計算量制御**:
- `maxGenerate = 100`: 生成上限
- 候補数が4個、桁数が4の場合: 4^4 = 256通り → 100通りに制限
- 早期終了で不要な計算を回避

### 複合スコアリングモデル

**スコア計算** (script.js:1104-1136):
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
  if(/^(\d)\1+$/.test(pin)) score -= 20; // 同一数字: -20pt
  if(pin === '1234' || pin === '0000') score -= 10; // よくあるPIN: -10pt

  return {pin, score};
});
```

**スコアリングの重み付け根拠**:
- **熱解析（15pt）**: 順序情報を持つため最高スコア
- **盗撮解析（10pt）**: 視覚的確認のため高信頼
- **指紋解析（8pt）**: 順序情報なし、やや低信頼
- **パターンペナルティ（-10~-20pt）**: セキュリティ教育的観点

**ソートと表示** (script.js:1139):
```javascript
return scored.sort((a, b) => b.score - a.score).slice(0, 10);
```

---

## 手で隠すモード - 永続的マスキング

### 実装場所

`script.js:1222-1326`

### 状態管理

**状態変数** (script.js:1222-1225):
```javascript
let handCoverInput = [];          // 実際の入力内容
let handCoverMode = false;        // モードのON/OFF状態
let handCoverStartIndex = 0;      // マスキング開始位置
let maskedIndices = new Set();    // 永続的にマスクされたインデックス
```

### 永続的マスキングロジック

**表示更新関数** (script.js:1227-1268):
```javascript
function updateHandCoverDisplay(showBriefly, digit){
  const displayEl = el('hand-cover-input');

  if(showBriefly && digit){
    // モードON時: 一時的に見せてからマスク
    const currentIndex = handCoverInput.length - 1;

    // 一時表示: マスク済み以外を表示
    let display = '';
    for(let i = 0; i < handCoverInput.length; i++){
      if(maskedIndices.has(i)){
        display += '*';
      } else if(i === currentIndex){
        display += digit; // 現在の桁だけ表示
      } else {
        display += handCoverInput[i];
      }
    }
    displayEl.textContent = display || '';

    // 300ms後に永続マスク
    setTimeout(() => {
      maskedIndices.add(currentIndex);

      // 再表示
      let display = '';
      for(let i = 0; i < handCoverInput.length; i++){
        if(maskedIndices.has(i)){
          display += '*';
        } else {
          display += handCoverInput[i];
        }
      }
      displayEl.textContent = display || '';
    }, 300);
  } else {
    // モードOFF時: マスク済みはマスクのまま表示
    let display = '';
    for(let i = 0; i < handCoverInput.length; i++){
      if(maskedIndices.has(i)){
        display += '*';
      } else {
        display += handCoverInput[i];
      }
    }
    displayEl.textContent = display || '';
  }
}
```

### 動作フロー

**シナリオ**: `1234` → モードON → `5` → モードOFF → `6`

1. **初期入力** (`1234`):
   ```javascript
   handCoverInput = ['1','2','3','4']
   maskedIndices = Set()
   display = "1234"
   ```

2. **モードON**:
   ```javascript
   handCoverMode = true
   handCoverStartIndex = 4
   // 表示は変わらない
   ```

3. **5を入力**:
   ```javascript
   handCoverInput = ['1','2','3','4','5']

   // 即座に表示
   display = "12345"

   // 300ms後
   maskedIndices = Set(4)
   display = "1234*"
   ```

4. **モードOFF**:
   ```javascript
   handCoverMode = false
   maskedIndices = Set(4)  // 変わらない
   display = "1234*"        // 変わらない
   ```

5. **6を入力**:
   ```javascript
   handCoverInput = ['1','2','3','4','5','6']
   maskedIndices = Set(4)  // 5だけマスク
   display = "1234*6"
   ```

### Setデータ構造の利用理由

```javascript
let maskedIndices = new Set();
```

**利点**:
- `O(1)` での存在チェック: `maskedIndices.has(i)`
- 重複を自動排除
- `add()`, `clear()` の直感的なAPI

**配列との比較**:
```javascript
// 配列の場合（非効率）
if(maskedIndicesArray.includes(i))  // O(n)

// Setの場合（効率的）
if(maskedIndices.has(i))           // O(1)
```

---

## パフォーマンス最適化

### 1. イベント委譲

**キーパッド実装** (script.js:227-260):
```javascript
function createKeypad(containerId, onClickCallback){
  const container = el(containerId);
  const keys = [];

  // 12個のボタンを一度に生成
  fingerKeys.forEach((label, i) => {
    const btn = document.createElement('div');
    btn.className = 'key';
    btn.textContent = label;
    btn.dataset.index = i;
    btn._label = label;  // データを要素に直接格納
    keys.push(btn);
    container.appendChild(btn);
  });

  // コンテナに1つのリスナーのみ
  container.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if(key && onClickCallback) onClickCallback(key);
  });

  return keys;
}
```

**利点**:
- 12個のイベントリスナー → 1個に削減
- メモリ使用量削減
- 動的要素の追加/削除に柔軟

### 2. キャンバス再描画の最適化

**サーマルキャンバス** (script.js:320-358):
```javascript
function drawThermal(){
  // 前提: 変更がない場合は呼び出されない

  ctx.clearRect(0, 0, w, h);  // 全体クリア（高速）

  // ループ内で状態変更を最小化
  for(let i = 0; i < 12; i++){
    const row = Math.floor(i / 3);
    const col = i % 3;

    // 座標計算
    const x = col * keyW;
    const y = row * keyH;

    // 色計算（ループ外で定数化可能なものは事前計算）
    const ratio = temps[i] / 40;
    const hue = (1 - ratio) * 240;

    // 描画
    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(x, y, keyW, keyH);
  }

  // 枠線は別ループ（fillStyleの変更回数を削減）
  ctx.strokeStyle = '#fff';
  // ...
}
```

**最適化ポイント**:
- `clearRect()` で全体を一度にクリア（個別のクリアより高速）
- スタイル変更を最小化
- 座標計算をループ内で完結

### 3. 計算結果のキャッシュ

**二項係数の計算** (script.js:622-638):
```javascript
function binomial(n, k){
  // 基本ケースの早期リターン
  if(k > n) return 0;
  if(k === 0 || k === n) return 1;

  // 対称性を利用: C(n,k) = C(n,n-k)
  k = Math.min(k, n - k);

  // 反復計算（再帰より高速、スタックオーバーフローなし）
  let result = 1;
  for(let i = 0; i < k; i++){
    result *= (n - i);
    result /= (i + 1);
    result = Math.round(result);
  }
  return result;
}
```

**計算量**:
- 再帰版: `O(2^min(k, n-k))` (指数時間)
- 反復版: `O(min(k, n-k))` (線形時間)

### 4. DOM操作のバッチ化

**計算ステップ表示** (script.js:778-786):
```javascript
// 悪い例（1行ごとにDOM変更）
steps.forEach(step => {
  stepsEl.textContent += step + '\n';  // 毎回リフロー
});

// 良い例（一度にまとめて追加）
stepsEl.innerHTML = '';
steps.forEach((step, idx) => {
  const line = document.createElement('div');
  line.style.marginBottom = '6px';
  line.textContent = `${idx + 1}. ${step}`;
  stepsEl.appendChild(line);  // DocumentFragmentを使うとさらに高速化可能
});
```

### 5. 遅延評価（Lazy Evaluation）

**候補列挙の制限** (script.js:549-561):
```javascript
function enumerateAllowed(digits, length, allowDup){
  const result = [];
  const maxResults = 5000;  // 上限設定（許容集合モード）

  function backtrack(current){
    if(result.length >= maxResults) return;  // 早期終了

    if(current.length === length){
      result.push(current);
      return;
    }

    for(const d of digits){
      if(!allowDup && current.includes(d)) continue;
      backtrack(current + d);
    }
  }

  backtrack('');
  return result;
}
```

**効果**:
- 10^10 = 10,000,000,000通りの生成を回避
- モード別上限（500～5000通り）で停止 → 99.95～99.9999%の計算を削減
- 表示は1000件まで（それ以上はCSVエクスポート）

---

## 開発時の注意点

### 1. データ構造の一貫性

攻撃結果の構造を統一:
```javascript
window._attackResults = {
  finger: ['1', '2', '3'],                    // 配列
  thermal: {candidates: [...], orderConfidence: 85},  // オブジェクト
  audio: 4,                                    // 数値
  video: {candidates: [...], confidence: 88}   // オブジェクト
};
```

### 2. デバッグログの活用

本番環境でもデバッグログを残す理由:
- ユーザーからの問題報告時に詳細情報を取得可能
- 教育ツールのため、動作原理の理解を促進
- `console.log()` は本番環境でのパフォーマンス影響が微小

### 3. 浮動小数点演算の注意

```javascript
// 悪い例
const result = (n * k) / m;  // 中間結果がオーバーフローの可能性

// 良い例
let result = n;
result *= k;
result /= m;
result = Math.round(result);  // 丸め誤差を補正
```

---

## 今後の拡張可能性

### 1. 新しい攻撃手法の追加

**追加手順**:
1. `window._attackResults` に新しいキーを追加
2. UI（index.html）に解析カードを追加
3. 解析ロジックを `script.js` に実装
4. `simRun()` 内で結果を統合
5. `generatePINRanking()` のスコアリングに追加

**例: 磁気センサー攻撃**:
```javascript
window._attackResults.magnetic = {
  candidates: ['2', '5', '8'],
  confidence: 65
};

// スコアリング
if(results.magnetic && results.magnetic.candidates){
  const magneticSet = new Set(results.magnetic.candidates);
  for(const d of pin){
    if(magneticSet.has(d)) score += 7;
  }
}
```

### 2. 機械学習モデルの統合

現在のスコアリングは手動の重み付けですが、機械学習で最適化可能:

```javascript
// 仮想実装
async function predictPIN(features){
  const model = await tf.loadLayersModel('model.json');
  const prediction = model.predict(tf.tensor2d([features]));
  return prediction.dataSync();
}
```

### 3. Web Workers による並列化

大量のPIN候補生成を並列化:

```javascript
// メインスレッド
const worker = new Worker('pin-generator-worker.js');
worker.postMessage({candidates, length, maxGenerate: 1000});
worker.onmessage = (e) => {
  const pins = e.data;
  displayPINRanking(scorePins(pins));
};

// pin-generator-worker.js
self.onmessage = (e) => {
  const {candidates, length, maxGenerate} = e.data;
  const pins = generateCombinations(candidates, length, maxGenerate);
  self.postMessage(pins);
};
```

---

## 参考文献・関連技術

### 数学的背景

1. **包除原理**: Inclusion-Exclusion Principle
   - 用途: 必須数字を含むPIN数の計算
   - 参考: [Wikipedia - Inclusion-exclusion principle](https://en.wikipedia.org/wiki/Inclusion%E2%80%93exclusion_principle)

2. **二項係数**: Binomial Coefficient
   - 用途: 組み合わせ数の計算
   - 公式: `C(n,k) = n! / (k!(n-k)!)`
   - 参考: [Wikipedia - Binomial coefficient](https://en.wikipedia.org/wiki/Binomial_coefficient)

3. **指数減衰**: Exponential Decay
   - 用途: 熱の時間変化モデル
   - 公式: `T(t) = T₀ × e^(-t/τ)`
   - 参考: [Wikipedia - Exponential decay](https://en.wikipedia.org/wiki/Exponential_decay)

### Web技術

1. **Canvas API**: High DPI対応
   - `devicePixelRatio` による高解像度描画
   - 参考: [MDN - Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

2. **Web Audio API**: 音声解析
   - `AudioContext`, `decodeAudioData` による波形処理
   - 参考: [MDN - Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

3. **Set データ構造**: 効率的な集合演算
   - O(1) での存在チェック
   - 参考: [MDN - Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)

### アルゴリズム

1. **バックトラッキング**: 組み合わせ生成
   - 深さ優先探索による全列挙
   - 参考: [Wikipedia - Backtracking](https://en.wikipedia.org/wiki/Backtracking)

2. **ピーク検出**: 信号処理
   - 閾値ベース検出法
   - 参考: [SciPy - find_peaks](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.find_peaks.html)

---

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## 著者

ipusiron - [GitHub](https://github.com/ipusiron)

## プロジェクト

**生成AIで作るセキュリティツール100** - Day088

---

最終更新: 2025-10-03
