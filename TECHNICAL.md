# TECHNICAL.md

開発者向けテクニカルドキュメント - PIN Threat Simulator

このドキュメントでは、本ツールの実装、仕組み、コアロジックの要点を解説します。
エンジンの純粋ロジックは `pin-engine.js` に、画面に出す文言は `pts-messages.js` に、
DOM 処理は `script.js` に分かれています。

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
- 補助: `parseWildcards`、`binom`、`generateCombinations`
- 期待値の総当たり照合: `test/engine.test.js`

### モード別の仕様

#### 1. 許容集合モード（allowed）

- 各桁は S から選ぶ
- 固定桁は指定の数字に固定する。その数字が S にないときは候補 0 とし、理由を `steps` に書く
- `allowDup = false` なら全桁が互いに異なる（固定桁も使用済みに数える）
- 計算式（重複あり）: 自由桁数 f、A = |S| として `A^f`
- 計算式（重複なし）: `P(A - 固定桁で使った数, f) = ∏_{i=0..f-1}(A' - i)`

#### 2. 必須包含モード（must）

- 各桁は S から選び、かつ S のすべての数字を少なくとも 1 回含む
- 固定桁は同様。固定桁の数字が S にないときは候補 0
- `allowDup = false` は n == |S| のときのみ候補があり、固定桁を除いた残りの順列
- `allowDup = true` は包除原理:

```
count = Σ_{i=0..k'} (-1)^i × C(k', i) × (A - i)^f

A = |S|
f = 自由桁数（n - 固定桁数）
R = 固定桁で含まれていない必須数字の集合、k' = |R|
```

#### 3. 部分特定モード（partial）

- 各桁は 0〜9 から選ぶ（S は使わない）
- 固定桁は同様
- `allowDup = false` なら全桁が互いに異なる

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

### 候補列挙

件数が上限以下の場合に辞書順で列挙します。上限は allowed/must が 5,000、partial が 500 です。
表示は 1,000 件まで、全件は CSV エクスポートで取得できます。

---

## 攻撃シミュレーション - 信頼度モデル

### 盗撮解析の信頼度計算

```
confidence = 100 - anglePenalty - errorPenalty

anglePenalty = (angle === 'tilt') ? 30 : 0
errorPenalty = min(50, pixelErr × 1.5)
```

### 検出数削減モデル

視点角度が `tilt` のときは、`videoAccuracy(pixelErr) = max(0.5, 1 - pixelErr/50)` を使い、
検出候補数を `ceil(count × accuracy)` に減らします。

```
videoAccuracy(0)   = 1.00
videoAccuracy(8)   = 0.84
videoAccuracy(25)  = 0.50（下限）
videoAccuracy(50)  = 0.50
```

さらに `pixelErr > 20` のときは検出数を半減させます。

### データ構造

```javascript
window._attackResults.video = {
  candidates: ['1', '2', '3', '4'],
  confidence: 88,
};
```

### レーダーチャートスコア

```javascript
video: Math.min(100, results.video.candidates.length * 15 + results.video.confidence * 0.5)
```

---

## レーダーチャート描画 - High DPI対応

Retina / 4K ディスプレイで文字がぼやけないように、`devicePixelRatio` を掛けた実ピクセルサイズを
キャンバスに設定し、描画コンテキスト側で `scale(dpr, dpr)` します。描画コード自体は CSS 座標系で書けます。

4 軸（指紋・熱・音響・盗撮）の値を上向きを 0 度として極座標 → デカルト座標に変換して描きます。

---

## 熱解析 - 指数減衰シミュレーション

### 物理モデル

```
T(t) = T₀ × e^(-t/τ)

T₀: 初期温度
t:  経過時間（秒）
τ:  時定数（既定 20 秒）
```

実装は `pin-engine.js:thermalDecay(initial, elapsed, tau = 20)`。

画面側 (`script.js`) では 1 秒ごとに描画を更新する簡易版（1℃/秒の線形減衰）を使い、
解析ボタンで減衰を停止して、その時点の温度で順序を推定します。

---

## 音響解析 - ピーク検出アルゴリズム

### 二重閾値クロッシング

```javascript
export function countPeaks(data, {rise = 0.3, fall = 0.1, stride = 200} = {}){
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
- サンプリングステップ `stride = 200`（44.1kHz 音源で約 4.5ms ごと）
- 入力は `Float32Array` などの配列ライク。空配列や null は 0 を返す

### 画面側の制約

- ファイルサイズ上限 20MB（超えたらエラー）
- 解析後に `AudioContext.close()` を呼び、デコード済みバッファの解放を促す

---

## PINランキング - 複合スコアリング

### 組み合わせ生成

バックトラッキングで候補を生成し、上限 100 に達したら即時終了します。
`4^4 = 256` 通りのうち、最初の 100 通りに制限します。

### スコアリング

| 要素 | 重み |
| --- | --- |
| 熱解析の順序一致（桁ごと） | +15 pt |
| 指紋解析で検出された数字 | +8 pt / 桁 |
| 盗撮解析で検出された数字 | +10 pt / 桁 |
| すべて同じ数字（例 `1111`） | -20 pt |
| `1234` / `0000` | -10 pt |

降順ソートして上位 10 件を表示します。

---

## 手で隠すモード - 永続的マスキング

モードを ON にして入力した桁だけを、入力直後 300ms 見せてから `*` でマスクします。
一度マスクした桁は、モードを OFF にしても `*` のままです。
内部状態は `handCoverInput`（入力配列）と `maskedIndices`（Set）で管理し、
`Set.has()` の O(1) 存在チェックで表示を再構築します。

---

## テストとCI

- `npm test`（`node --test`、依存なし）
- テスト構成:
  - `test/engine.test.js`: 期待値 15 件 + 総当たり参照実装による多ケース照合
  - `test/i18n.test.js`: `script.js` に日本語リテラル 0 件
  - `test/html.test.js`: CSP meta、favicon、noscript、`type="module"`、
    インラインハンドラー / style 属性なし、主要 id の実在
  - `test/contrast.test.js`: ライト・ダーク両方で主要の文字/背景の組が WCAG AA 4.5:1 以上
  - `test/format.test.js`: 行長と主要ファイルの行数下限
  - `test/readme.test.js`: README の計算例・画像参照・YAML・禁止語
- CI: `.github/workflows/test.yml` が push と pull_request で Node 22 の `npm test` を実行

### ローカル確認

```bash
npm test
python -m http.server 8099    # file:// では module が動かないため HTTP で配信する
```

---

## パフォーマンス最適化

- 二項係数は反復計算で `O(min(k, n-k))`
- 候補列挙は上限（500〜5,000）で早期打ち切り
- キャンバスの `clearRect` + スタイル変更の最小化
- 計算結果のキャッシュ（`window._calcResult`）で計算過程の再描画を即座に

---

## 参考文献

- 包除原理: [Wikipedia](https://en.wikipedia.org/wiki/Inclusion%E2%80%93exclusion_principle)
- 二項係数: [Wikipedia](https://en.wikipedia.org/wiki/Binomial_coefficient)
- 指数減衰: [Wikipedia](https://en.wikipedia.org/wiki/Exponential_decay)
- Web Audio API: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- Canvas API: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

---

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## 著者

ipusiron - [GitHub](https://github.com/ipusiron)

## プロジェクト

**生成AIで作るセキュリティツール100** - Day088
