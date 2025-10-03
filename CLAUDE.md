# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PIN Threat Simulator** is an educational web-based tool that simulates attack techniques against PIN authentication systems. It demonstrates how PINs can be analyzed through various attack vectors and teaches effective defense strategies.

**Purpose**: Educational only - to help students and security professionals understand authentication vulnerabilities in a safe environment.

**Tech Stack**: Pure client-side JavaScript, HTML5 Canvas, CSS. No build process, no dependencies.

## How to Run

Open `index.html` directly in a browser. No server or build step required.

For GitHub Pages deployment, files are served directly from the repository root.

## Architecture

### Three-Tab Structure

1. **PINパターン計算 (PIN Pattern Calculation)** - Combinatorics engine for candidate calculation
2. **攻撃シミュレーション (Attack Simulation)** - Multi-method attack demonstration
3. **セキュリティ (Security)** - Defense strategies and educational content

### Core Components (all in script.js)

**Candidate Calculation Engine** (`computeCandidates` function, lines 132-262):
- Implements three modes: `allowed` (restriction-based), `must` (inclusion-based), `partial` (wildcard-based)
- Uses inclusion-exclusion principle for `must` mode with binomial coefficients
- Supports wildcards (`*`) for partial digit specification
- Handles duplicate/non-duplicate constraints

**Attack Simulators**:
- **Fingerprint Analysis** (`finger-grid`, lines 44-67): Interactive 3×4 keypad with density values (0-100) to simulate smudge patterns
- **Thermal Analysis** (`drawThermal`, lines 74-113): Canvas-based heatmap with exponential decay simulation (decay constant = 20s)
- **Acoustic Analysis** (`analyze-audio`, lines 409-432): Simple peak detection in audio waveforms to estimate digit count
- **Shoulder Surfing** (video mock, lines 357-367): Simulates coordinate error degradation based on viewing angle

**Integration Flow**:
1. User configures attack parameters in simulation tab
2. `simRun()` (lines 330-384) aggregates results from all enabled attack methods
3. Results stored in `window._simResult`
4. "Push to Calc" button transfers candidates to calculation tab for pattern analysis

### Key Data Structures

- `fingerKeys`: 3×4 keypad layout mapping (indices 0-11 to digits 1-9, *, 0, #)
- `baseTemps`: Array of 12 thermal values used for heat decay simulation
- `window._simResult`: Shared state object containing `{candidates, length, orderConfidence}`

### Canvas Rendering

**Thermal Canvas** (300×300px, lines 72-113):
- Renders 3×4 grid with color mapping: HSL hue 240 (blue) to 0 (red) based on temperature
- Updates reactively with time-slider (0-60s decay simulation)

**Random Keypad Canvas** (260×320px, lines 437-481):
- Demonstrates randomized keypad layout defense
- Fisher-Yates shuffle algorithm for digit randomization

## Educational Purpose & Constraints

This tool is **strictly for educational use** in controlled environments (classrooms, workshops, research).

**Do NOT**:
- Modify code to facilitate actual attacks
- Remove or weaken educational disclaimers
- Add functionality for automated PIN cracking

**Acceptable modifications**:
- Adding new educational attack simulations with clear explanations
- Improving calculation algorithm performance
- Enhancing defense strategy demonstrations
- Adding multilingual support

## Key Implementation Details

**Binomial Calculation** (lines 265-271): Uses iterative formula with rounding to avoid floating-point errors

**Inclusion-Exclusion Formula** (lines 210-219):
```
Σ(i=0 to k) (-1)^i * C(k,i) * (A-i)^n
```
where A = alphabet size, k = required digits, n = PIN length

**Peak Detection Algorithm** (lines 418-425): Threshold-based crossing detection with 200-sample stride for performance

**Export Formats**:
- JSON: Full session state (`collectSession()`)
- CSV: Candidate list only
- Simulation result: Attack method outputs

## Common Modifications

**Adding a new attack method**:
1. Add checkbox in `<div class="card"><h3>手法選択</h3>` section (index.html:94)
2. Create UI controls in new `.card` element
3. Implement detection logic in `simRun()` function
4. Update `union` array merge (line 370)

**Changing calculation limits**:
- `cap` variables control when full enumeration occurs (lines 167, 221, 248)
- `maxList` input controls display limit (default 200)

**Modifying thermal decay**:
- Adjust decay constant `dec=20` (lines 104, 346)
- Change exponential formula `t * Math.exp(-s/dec)` (line 105)

---

## TODO: Future Improvements

記録日: 2025-10-03

以下は今後の改善案です。優先度別に分類されています。

### 🔴 高優先度（即座に実装推奨）

#### UI/UX
- [ ] **#1 ファビコン追加**
  - 🔐や🎯のSVGアイコン化、またはPNG形式
  - 効果: ブラウザータブでの視認性向上

- [ ] **#2 OGP画像設定**
  - `og:image`メタタグ追加
  - スクリーンショット（assets/screenshot.png）を使用
  - 効果: SNS共有時のリッチプレビュー

#### 技術的改善
- [ ] **#8 デバッグログの本番環境対策**
  - 環境変数または開発/本番モード切り替え
  - 例: `const DEBUG = false; if(DEBUG) console.log(...);`
  - 現在6個のconsole文が存在

#### セキュリティ
- [ ] **#23 Content Security Policy (CSP)**
  - メタタグまたはHTTPヘッダーでCSP設定
  - XSS対策の追加レイヤー

#### ドキュメント
- [ ] **#27 対応ブラウザー情報の明記**
  - README.mdに動作確認済みブラウザー情報追加
  - Chrome, Firefox, Safari, Edgeのバージョン情報

---

### 🟡 中優先度（次期バージョンで検討）

#### UI/UX
- [ ] **#3 ローディング状態の追加**
  - 音響解析のAudioContext処理時にスピナー表示
  - 熱解析60秒間のプログレスバー
  - 効果: ユーザー体験向上

- [ ] **#4 エラーメッセージの改善**
  - 具体的な対処方法を提示
  - 例: 「対応フォーマット: MP3, WAV, OGG」
  - 現在: script.js:1216

- [ ] **#5 レスポンシブデザインの最適化**
  - モバイルでのキーパッドサイズ調整
  - タブレット横向きの2カラムレイアウト最適化

- [ ] **#6 キーボードアクセシビリティ**
  - キーパッド（.key要素）に`tabindex="0"`追加
  - キーボードイベントハンドラー実装

- [ ] **#7 ARIA属性の追加**
  - レーダーチャート（canvas）に`aria-label`
  - 動的コンテンツに`aria-live`
  - アクセシビリティ向上

#### 技術的改善
- [ ] **#9 グローバルエラーハンドラー**
  - `window.addEventListener('error', ...)` 実装
  - エラーバウンダリー設定

- [ ] **#10 パフォーマンス測定**
  - `performance.now()`で計算時間測定・表示
  - 例: 「○○ms で計算完了」
  - 教育的価値向上

- [ ] **#12 Service Worker / PWA化**
  - オフライン対応
  - インストール可能なアプリ化
  - manifest.json作成

- [ ] **#13 localStorageの活用拡張**
  - 最後の計算設定を保存（プライバシー配慮）
  - 効果: 再訪問時の利便性

#### データ・ロジック
- [ ] **#14 音響解析の閾値UI調整**
  - 現在固定: `threshold = 0.3` (script.js:1195)
  - スライダーで調整可能に
  - 異なる録音環境への対応

- [ ] **#15 熱解析の時定数カスタマイズ**
  - 現在固定: `dec = 20` (script.js:344)
  - 材質選択（プラスチック/金属）で変更
  - より現実的なシミュレーション

- [ ] **#18 PINランキングのスコア可視化**
  - 現在: 数値のみ
  - プログレスバーまたはスター評価追加
  - 直感的な理解促進

#### ドキュメント
- [ ] **#19 多言語対応**
  - 英語版README追加（README_EN.md）
  - 国際的な教育利用促進

- [ ] **#20 チュートリアル動画・GIF**
  - 使い方のGIFアニメーション
  - READMEに追加
  - 初見ユーザーの理解促進

- [ ] **#21 用途別クイックスタートガイド**
  - 「初めてのユーザー向け」
  - 「教育者向け」
  - 「研究者向け」シナリオ

- [ ] **#22 FAQセクション**
  - よくある質問への事前回答
  - 例: 「実際の攻撃に使えますか？」「データは保存されますか？」

#### デプロイ・運用
- [ ] **#35 CI/CDパイプライン**
  - GitHub Actionsで自動デプロイ
  - リンター、フォーマッター統合

- [ ] **#36 バージョン管理の明示**
  - package.json作成
  - UIにバージョン番号表示

- [ ] **#37 CHANGELOG.md作成**
  - Keep a Changelog形式
  - 更新内容の追跡

---

### 🟢 低優先度（長期的な改善）

#### 技術的改善
- [ ] **#11 Web Workers活用**
  - 大量PIN生成（5000通り）の並列化
  - TECHNICAL.mdに記載あり（未実装）
  - UIの応答性向上

- [ ] **#16 盗撮解析の信頼度モデル高度化**
  - 現在: 線形ペナルティ
  - 非線形モデル（ロジスティック関数）
  - より現実的な精度劣化

- [ ] **#17 機械学習による最適化**
  - 統合分析の重み付け自動最適化
  - TECHNICAL.mdに記載あり（未実装）
  - 現在の手動重み: 熱15pt, 盗撮10pt, 指紋8pt

#### テスト・品質保証
- [ ] **#26 自動テストの導入**
  - Jest等でユニットテスト
  - `computeCandidates()`各モードのテスト
  - 計算エンジンの正確性保証

- [ ] **#28 E2Eテストの導入**
  - Playwright/Cypressでの自動テスト
  - UI操作フローの検証

#### ドキュメント
- [ ] **#24 利用規約の明示**
  - TERMS_OF_USE.md作成
  - SECURITY.mdとの統合

- [ ] **#25 教育機関向けライセンス情報**
  - LICENSEファイルに教育利用条項明記
  - 商用利用との境界明確化

#### 分析・改善サイクル
- [ ] **#29 プライバシー重視の分析ツール**
  - Plausible等の導入検討
  - 利用状況の把握（プライバシー配慮）

- [ ] **#30 フィードバック機能**
  - GitHub Issuesへのリンク
  - または簡易フォーム追加

#### 教育的価値の向上
- [ ] **#31 インタラクティブチュートリアル**
  - intro.js等でステップバイステップガイド
  - 初回訪問時のオンボーディング

- [ ] **#32 クイズ/確認問題機能**
  - 「セキュリティクイズ」タブ追加
  - 学習効果測定

- [ ] **#33 シナリオベース学習**
  - 「ATMでのPIN入力シナリオ」等
  - ストーリー型学習の導入

- [ ] **#34 攻撃成功率の可視化強化**
  - 「あなたのPINは○○%の確率で破られます」
  - より明確なリスク提示

#### 視覚的改善
- [ ] **#38 テーマ切り替えアニメーション**
  - スムーズなトランジション追加
  - 現在: 即座に切り替わる

- [ ] **#39 カラースキームのアクセシビリティ**
  - WCAG AA/AAA準拠確認
  - axe DevTools等でチェック

- [ ] **#40 マイクロインタラクション**
  - ボタン押下時のリップル効果
  - サウンドエフェクト（オプション）

---

## Implementation Notes

### Quick Wins（すぐに実装可能）
最も簡単に実装できる改善項目:
1. #1 ファビコン追加（1行のHTMLタグ追加）
2. #2 OGP画像設定（既存のscreenshot.png利用）
3. #8 デバッグログの条件分岐追加
4. #27 README.mdへの対応ブラウザー情報追記

### Breaking Changes（破壊的変更を伴う）
慎重に検討すべき改善項目:
- #11 Web Workers（データフロー変更）
- #12 Service Worker（キャッシュ戦略必要）
- #17 機械学習統合（新しい依存関係）

### Dependencies Required（依存関係が必要）
現在の「依存関係なし」ポリシーに反する項目:
- #26 Jest（開発依存関係のみ）
- #28 Playwright/Cypress（開発依存関係のみ）
- #31 intro.js（実行時依存関係）

これらは代替案（純粋なJavaScript実装）を検討すべき。

---

## Related Documents

- 技術詳細: [TECHNICAL.md](TECHNICAL.md)
- セキュリティポリシー: [SECURITY.md](SECURITY.md)
- プロジェクト概要: [README.md](README.md)
