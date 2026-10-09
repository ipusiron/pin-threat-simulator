// pts-messages.js
// Centralized string dictionary for PIN Threat Simulator (ja + en).
// Pure data + a tiny formatter. The host decides the active language.

'use strict';

const DICT = {
  ja: {
    // Calculation steps (returned by pin-engine as {key, params}).
    'step.inputSet':            ({set}) => `入力候補集合: { ${set.join(', ')} }`,
    'step.mode':                ({mode, allowDup}) => `モード: ${mode}（重複${allowDup ? 'あり' : 'なし'}）`,
    'step.wildcards':           ({wilds}) => `ワイルドカード指定: ${wilds.join(',')}`,
    'step.fixedNotInSet':       ({token}) => `固定桁の数字 "${token}" が候補集合に含まれないため、候補は0`,
    'step.fixedDup':            ({token}) => `固定桁の重複（"${token}"）があるため、重複なしでは候補は0`,
    'step.allowedDupCount':     ({A, f, count}) => `許容集合モード（重複あり）: 自由桁数 ${f}、|S|=${A} → ${A}^${f} = ${count}`,
    'step.allowedNoDupCount':   ({A, f, count}) => `許容集合モード（重複なし）: 自由桁数 ${f}、|S|=${A} → 順列 → ${count}`,
    'step.allowedNoDupShort':   ({A, n}) => `許容集合モード（重複なし）: |S|=${A} が桁数 ${n} より少ないため、候補は0`,
    'step.mustImpossible':      ({A, n}) => `必須包含モード: |S|=${A} が桁数 ${n} を超えるため、候補は0`,
    'step.mustNoDupLen':        ({A, n}) => `必須包含モード（重複なし）: |S|=${A} と桁数 ${n} が一致しないため、候補は0`,
    'step.mustNoDupCount':      ({A, n, count}) => `必須包含モード（重複なし）: 固定桁を除いた残りの順列 → ${count}`,
    'step.mustDupCount':        ({A, f, kprime, count}) => `必須包含モード（重複あり）: 包除原理 Σ(-1)^i × C(${kprime},i) × (${A}-i)^${f} → ${count}`,
    'step.partialDupCount':     ({f, count}) => `部分特定モード（重複あり）: 10^${f} = ${count}`,
    'step.partialNoDupCount':   ({f, count}) => `部分特定モード（重複なし）: 自由桁数 ${f} に対する順列 → ${count}`,
    'step.partialNoDupShort':   ({n}) => `部分特定モード（重複なし）: 桁数 ${n} が多すぎるため、候補は0`,
    'step.unknownMode':         ({mode}) => `未知のモード: ${mode}`,

    // Audio analysis UI.
    'audio.tooLarge':           ({limitMB}) => `音声ファイルが大きすぎます（上限 ${limitMB}MB）`,
    'audio.decodeFailed':       () => '音声ファイルの解析に失敗しました',
    'audio.inputNeeded':        () => 'テンキーでPINを入力するか、音声ファイルを選択してください',
    'audio.doneToast':          () => '音響解析完了',
    'audio.resultFile':         ({peaks}) => `<strong>検出ピーク数:</strong> ${peaks}<br><strong>推定PIN桁数:</strong> ${peaks}<br><small>音声ファイルから検出</small>`,
    'audio.resultKeypad':       ({taps}) => `<strong>検出打鍵回数:</strong> ${taps}<br><strong>推定PIN桁数:</strong> ${taps}<br><small>テンキー入力から検出</small>`,
    'audio.resultSample':       ({peaks}) => (
      `<strong>検出ピーク数:</strong> ${peaks}` +
      `<br><strong>推定PIN桁数:</strong> ${peaks}` +
      `<br><small>サンプル: pin-taps-4.wav（打鍵4回）</small>`
    ),
    'audio.sampleFailed':       () => 'サンプル音声の読み込みに失敗しました',

    // Fingerprint analysis UI.
    'finger.result':            ({digits, threshold}) => (
      `<strong>検出された数字:</strong> ${digits.length ? digits.join(', ') : '(なし)'}` +
      `<br><small>閾値 ${threshold} 以上の濃度を持つキー</small>`
    ),
    'finger.doneToast':         () => '指紋解析完了',
    'finger.clearedToast':      () => '指紋データをクリアしました',

    // Thermal analysis UI.
    'thermal.result':           ({digits, orderConfidence, timeS}) => (
      `<strong>検出された数字:</strong> ${digits.length ? digits.join(', ') : '(なし)'}` +
      `<br><strong>順序確度:</strong> ${orderConfidence}%` +
      `<br><small>経過時間: ${timeS}秒、温度閾値 3℃以上</small>`
    ),
    'thermal.doneToast':        () => '熱解析完了（減衰停止）',

    // Shoulder surfing UI.
    'video.needInput':          () => 'テンキーでPINを入力してください',
    'video.result':             ({pin, digits, angle, pixelErr, confidence}) => (
      `<strong>入力PIN:</strong> ${pin}` +
      `<br><strong>検出された数字:</strong> ${digits.join(', ')}` +
      `<br><strong>視点:</strong> ${angle === 'top' ? '真上' : '斜め'}` +
      `<br><strong>誤差:</strong> ${pixelErr}px` +
      `<br><strong>信頼度:</strong> ${confidence}%`
    ),
    'video.doneToast':          () => '盗撮解析完了',

    // Integration tab.
    'sim.needRun':              () => '先に「シミュレーション実行」を押してください',
    'sim.needSim':              () => '先にシミュレーション実行してください',
    'sim.needSimTab':           () => '攻撃シミュレーションタブで解析を実行してください',
    'sim.doneToast':            () => '全手法を統合しました',
    'sim.pushedToast':          () => '攻撃シミュレーション結果を反映しました',
    'sim.initial':              () => '各攻撃手法を実行後、「全手法を統合」を押してください。',
    'sim.rankingPlaceholder':   () => '候補数字を解析後、ランキングが表示されます',
    'sim.beforeAnalysis':       () => '解析実行後に表示されます',

    // Hint lines.
    'hint.riskHigh':            () => '⚠️ <strong>高リスク:</strong> 複数の攻撃手法から有効な情報が得られています。PIN認証の脆弱性が深刻です。',
    'hint.riskMid':             () => '⚡ <strong>中リスク:</strong> いくつかの攻撃手法が有効でした。追加の防御策を検討してください。',
    'hint.riskLow':             () => '✓ <strong>低リスク:</strong> 現在の攻撃手法では限定的な情報しか得られていません。',
    'hint.finger':              () => '🔍 <strong>指紋対策:</strong> 入力後は画面を清掃し、疎油性コーティングの使用を推奨します。',
    'hint.thermal':             () => '🌡️ <strong>熱対策:</strong> 熱検出を防ぐため、ダミー入力やランダムキーへのタッチを検討してください。',
    'hint.audio':               () => '🔊 <strong>音響対策:</strong> 静音キーパッドの使用、または環境音を活用した音響カモフラージュが有効です。',
    'hint.video':               () => '📹 <strong>盗撮対策:</strong> 入力時は手で覆う、画面に視覚的な障壁を設置することを推奨します。',
    'hint.candidateTight':      ({len, total}) => `🎯 <strong>危険:</strong> 候補数字が${len}個のみ。${total}通りの総当たり攻撃が現実的です。`,
    'hint.candidateNarrow':     ({len}) => `⚠️ 候補数字が絞り込まれています（${len}個）。組み合わせ数を増やす対策が必要です。`,

    // Export / toast.
    'export.sessionDone':       () => 'セッションデータをエクスポートしました',
    'export.simDone':           () => 'シミュレーション結果をエクスポートしました',
    'export.csvEmpty':          () => 'エクスポートする候補がありません',
    'export.csvDone':           ({total}) => `候補リストをCSVでエクスポートしました（全 ${total} 件）`,

    // Hand cover mode toasts.
    'cover.on':                 () => '手で隠すモードON: これ以降の入力がマスクされます',
    'cover.off':                () => '手で隠すモードOFF: マスク済みの数字はそのまま',
    'cover.cleared':            () => '入力をクリアしました',

    // Candidates area.
    'cand.truncated':           ({remaining, count}) => `... 残り ${remaining} 件（全 ${count} 件）`,
    'cand.csvNote':             () => '※ 全パターンはCSVエクスポートで確認できます',
    'cand.empty':               () => '(一覧は条件次第で省略されました)',

    // Steps display helpers.
    'steps.placeholder':        () => '計算を実行すると、ここに計算過程が表示されます。',

    // Radar labels.
    'radar.finger':             () => '指紋',
    'radar.thermal':            () => '熱',
    'radar.audio':              () => '音響',
    'radar.video':              () => '盗撮',

    // Result label fragments shared across analyzers.
    'label.detected':           () => '検出された数字:',
    'label.none':               () => '(なし)',
    'label.inputPin':           () => '入力PIN:',
    'label.viewTop':            () => '真上',
    'label.viewTilt':           () => '斜め',

    // --- Static UI strings (index.html, injected via data-i18n) ----------
    'ui.lang':                  () => 'ja',
    'ui.title':                 () => 'PIN Threat Simulator - PIN認証攻撃シミュレーター',
    'ui.metaDescription':       () => 'PIN認証の脆弱性を学ぶための教育用Webシミュレーター。指紋解析、熱解析、音響解析などの攻撃手法と防御策を安全に体験できます。',
    'ui.ogTitle':               () => 'PIN Threat Simulator - 教育用',
    'ui.ogDescription':         () => '⚠️ 教育目的専用：PIN認証の脆弱性を安全に学習するためのシミュレーター',
    'ui.noscript':              () => 'このツールはJavaScriptを使用します。ブラウザーのJavaScriptを有効にしてください。',
    'ui.appTitle':              () => 'PIN Threat Simulator',
    'ui.appSubtitle':           () => 'PIN認証の攻撃手法と防御策を学ぶための教育用シミュレーター',
    'ui.themeToggleTitle':      () => 'テーマ切り替え',
    'ui.langToggleAria':        () => '言語を切り替え',
    'ui.langToggleTitle':       () => '言語を切り替え（JA／EN）',
    'ui.langToggleLabel':       () => '🌐 EN',
    'ui.exportSessionTitle':    () => '計算設定とシミュレーション結果を含む全セッションデータをJSONでエクスポート',
    'ui.exportSessionLabel':    () => 'セッションをエクスポート (JSON)',

    'ui.tabsAria':              () => 'メインタブ',
    'ui.tabCalc':               () => 'PINパターン計算',
    'ui.tabSim':                () => '攻撃シミュレーション',
    'ui.tabSec':                () => 'セキュリティ解説',

    'ui.digitSetLabel':         () => '候補数字集合（クリックで選択の切り替え）',
    'ui.digitSetTooltip':       () => '攻撃で検出された可能性のある数字を選択します。クリックで選択・解除を切り替えます。',
    'ui.pinLengthLabel':        () => 'PIN桁数',
    'ui.pinLengthTooltip':      () => 'PINコードの桁数を指定します。音響解析などで桁数が推定できている場合に設定します。',
    'ui.modeLabel':             () => 'モード',
    'ui.modeTooltip':           () => '許容集合: 選択した数字のみ使用可能。必須包含: 選択した数字をすべて含む。部分特定: 選択した数字が可能性あり（0〜9すべて許容）。',
    'ui.modeAllowed':           () => '許容集合モード（候補集合以外不可）',
    'ui.modeMust':              () => '必須包含モード（候補集合をすべて含む）',
    'ui.modePartial':           () => '部分特定モード（候補集合は可能性あり）',
    'ui.allowDupLabel':         () => '重複を許可',
    'ui.allowDupTooltip':       () => '同じ数字を複数回使用できるかを設定します（例: 1111 や 1234）。',
    'ui.wildcardsLabel':        () => 'ワイルドカード桁',
    'ui.wildcardsTooltip':      () => '特定の位置の数字がわかっているときに使います。カンマ区切りで指定し、不明な桁は「*」を使います。例: *,*,2,* は3桁目が2で他は不明。',
    'ui.wildcardsPlaceholder':  () => '例: *,*,2,*',

    'ui.calcBtn':               () => '計算する',
    'ui.clearBtn':              () => 'クリア',
    'ui.useFromSim':            () => '攻撃シミュレーション結果を使う',

    'ui.resultHeading':         () => '結果',
    'ui.resultTotalLabel':      () => '候補総数:',
    'ui.resultLengthLabel':     () => '推定桁数:',
    'ui.showStepsLabel':        () => '計算過程を表示（教育用）',
    'ui.candidatesHeading':     () => '候補一覧',
    'ui.csvBtnTitle':           () => '候補一覧をCSVでエクスポート',

    'ui.fingerHeading':         () => '🔍 指紋解析',
    'ui.fingerTooltip':         () => 'テンキー上の指紋や皮脂の痕跡から、どのキーが押されたかを推定します。各キーをクリックして濃度（0〜100）を変更できます。',
    'ui.fingerThresholdLabel':  () => '検出閾値 (>=)',
    'ui.analyzeBtn':            () => '解析',

    'ui.thermalHeading':        () => '🌡️ 熱解析',
    'ui.thermalTooltip':        () => 'サーマルカメラで入力直後の温度変化を検出します。押されたキーは温度が高く、時間とともに冷却します。',
    'ui.thermalHelper':         () => 'テンキーをクリックしてPINを入力 → 経過時間スライダーで温度減衰を確認',
    'ui.thermalTimeLabel':      () => '経過時間 (s)',

    'ui.audioHeading':          () => '🔊 音響解析',
    'ui.audioTooltip':          () => 'PIN入力時の打鍵音から、音のピーク数を検出してPINの桁数を推定します。テンキー（数字関係なし）を押すか、音声ファイルを読み込ませてください。',
    'ui.audioTapCountLabel':    () => '打鍵回数:',
    'ui.audioFileLabel':        () => '音声ファイル',
    'ui.audioFileTooltip':      () => 'PIN入力時の打鍵音を録音した音声ファイル（MP3、WAVなど）をアップロード。波形から音のピーク（打鍵回数）を検出し、PINの桁数を推定します。',
    'ui.audioSampleBtn':        () => 'サンプル音声で試す',
    'ui.audioSampleTitle':      () => '同梱の人工音声（打鍵4回・約1.6秒）で音響解析の動作を確認します',

    'ui.videoHeading':          () => '📹 盗撮解析',
    'ui.videoTooltip':          () => 'カメラ盗撮やショルダーハッキングで覗き見ます。視点や誤差によって検出精度が変わります。',
    'ui.videoPinLabel':         () => '入力PIN:',
    'ui.videoAngleLabel':       () => '視点',
    'ui.videoAngleTooltip':     () => '真上: 監視カメラが真上に設置された理想条件。すべての数字を検出可能。斜め: 肩越しや斜めからの撮影。信頼度 -30%、検出数が最大50%削減。',
    'ui.videoAngleTop':         () => '真上（高精度）',
    'ui.videoAngleTilt':        () => '斜め（精度-30%、検出数減）',
    'ui.pixelErrorLabel':       () => '視角誤差（px）',
    'ui.pixelErrorTooltip':     () => 'カメラ解像度・距離・手振れなどによる座標検出の不正確さ。0〜20px: 低誤差、信頼度ペナルティのみ。20px超: 高誤差、検出数が半減し信頼度も大幅低下。',

    'ui.analysisHeading':       () => '📊 統合分析',
    'ui.runSim':                () => '全手法を統合',
    'ui.exportSim':             () => 'エクスポート',
    'ui.pushToCalc':            () => 'PINパターン計算へ転送',
    'ui.radarHeading':          () => '攻撃手法の有効性',
    'ui.expertHints':           () => '💡 専門家のヒント',
    'ui.pinRankingHeading':     () => '🎯 推定PINランキング',
    'ui.simCandidatesLabel':    () => '候補集合:',
    'ui.simLengthLabel':        () => '推定桁数:',
    'ui.simOrderLabel':         () => '順序確度:',
    'ui.simInitialHint':        () => '各攻撃手法を実行後、「全手法を統合」を押してください。',
    'ui.rankingInitial':        () => '解析実行後に表示されます',

    'ui.secHeading':            () => '各攻撃への対策',
    'ui.secFingerTitle':        () => '🔍 指紋解析',
    'ui.secFingerKnow':         () => 'わかること: 押されたキーの候補集合',
    'ui.secFingerUnknown':      () => 'わからないこと: 正確な順序（通常）',
    'ui.secFingerCondition':    () => '有効な条件: 表面がヌルっとしていて時間が短い場合',
    'ui.secThermalTitle':       () => '🌡️ 熱解析',
    'ui.secThermalKnow':        () => 'わかること: 押した直後は温度差で順序のヒント',
    'ui.secThermalLimit':       () => '限界: 時間経過・複数回押下で判定困難',
    'ui.secAudioTitle':         () => '🔊 音響解析',
    'ui.secAudioKnow':          () => 'わかること: 打鍵回数（桁数）',
    'ui.secAudioUnknown':       () => 'わからないこと: 押した数字（部屋の反響などで困難）',
    'ui.secVideoTitle':         () => '📹 盗撮解析（ショルダーハッキングを含む）',
    'ui.secVideoKnow':          () => 'わかること: 視点・距離に応じて入力されたキーの位置',
    'ui.secVideoLimit':         () => '限界: 角度・解像度・手で隠すことで精度が下がる',
    'ui.secVideoDefense':       () => '対策: 入力時に手で覆う、画面を傾ける',

    'ui.randomHeading':         () => 'ランダムテンキーのデモ',
    'ui.shuffleBtn':            () => 'シャッフル',
    'ui.resetBtn':              () => 'リセット',
    'ui.inputLabel':            () => '入力内容:',
    'ui.clearMiniBtn':          () => 'クリア',
    'ui.handCoverLabel':        () => '✋ 手で隠すモード（入力後すぐマスク）',
    'ui.randNote':              () => 'ランダム配置は盗撮・指紋攻撃への難易度を上げます。',

    'ui.checklistHeading':      () => '実運用チェックリスト',
    'ui.checklist1':            () => '入力時は手で押し隠す／画面でテンキーを覆う',
    'ui.checklist2':            () => 'ATMではランダム表示テンキー（採用されている場合あり）を使う',
    'ui.checklist3':            () => '重要な端末は複合認証（カード＋PIN）を採用',
    'ui.checklist4':            () => '端末の表面は定期的に清掃し、指紋痕跡を残さない',

    'ui.footer':                () => '🔗 GitHubリポジトリーはこちら',
  },

  en: {
    // Calculation steps (returned by pin-engine as {key, params}).
    'step.inputSet':            ({set}) => `Input candidate set: { ${set.join(', ')} }`,
    'step.mode':                ({mode, allowDup}) => `Mode: ${mode} (duplicates ${allowDup ? 'allowed' : 'not allowed'})`,
    'step.wildcards':           ({wilds}) => `Wildcard pattern: ${wilds.join(',')}`,
    'step.fixedNotInSet':       ({token}) => `Fixed digit "${token}" is not in the candidate set, so count is 0`,
    'step.fixedDup':            ({token}) => `Fixed digit "${token}" appears more than once, so no-duplicate count is 0`,
    'step.allowedDupCount':     ({A, f, count}) => `Allowed-set (dup): free positions ${f}, |S|=${A} -> ${A}^${f} = ${count}`,
    'step.allowedNoDupCount':   ({A, f, count}) => `Allowed-set (no dup): free positions ${f}, |S|=${A} -> permutations -> ${count}`,
    'step.allowedNoDupShort':   ({A, n}) => `Allowed-set (no dup): |S|=${A} is smaller than the length ${n}, so count is 0`,
    'step.mustImpossible':      ({A, n}) => `Must-include: |S|=${A} exceeds the length ${n}, so count is 0`,
    'step.mustNoDupLen':        ({A, n}) => `Must-include (no dup): |S|=${A} does not equal the length ${n}, so count is 0`,
    'step.mustNoDupCount':      ({A, n, count}) => `Must-include (no dup): permutations of the remaining digits -> ${count}`,
    'step.mustDupCount':        ({A, f, kprime, count}) => `Must-include (dup): inclusion-exclusion Sum(-1)^i * C(${kprime},i) * (${A}-i)^${f} -> ${count}`,
    'step.partialDupCount':     ({f, count}) => `Partial (dup): 10^${f} = ${count}`,
    'step.partialNoDupCount':   ({f, count}) => `Partial (no dup): permutations over ${f} free positions -> ${count}`,
    'step.partialNoDupShort':   ({n}) => `Partial (no dup): length ${n} is too large, so count is 0`,
    'step.unknownMode':         ({mode}) => `Unknown mode: ${mode}`,

    // Audio analysis UI.
    'audio.tooLarge':           ({limitMB}) => `Audio file is too large (limit: ${limitMB}MB).`,
    'audio.decodeFailed':       () => 'Failed to decode the audio file.',
    'audio.inputNeeded':        () => 'Enter a PIN on the keypad or choose an audio file.',
    'audio.doneToast':          () => 'Acoustic analysis complete',
    'audio.resultFile':         ({peaks}) => (
      `<strong>Detected peaks:</strong> ${peaks}` +
      `<br><strong>Estimated PIN length:</strong> ${peaks}` +
      `<br><small>Detected from the audio file.</small>`
    ),
    'audio.resultKeypad':       ({taps}) => (
      `<strong>Keypress count:</strong> ${taps}` +
      `<br><strong>Estimated PIN length:</strong> ${taps}` +
      `<br><small>Detected from keypad input.</small>`
    ),
    'audio.resultSample':       ({peaks}) => (
      `<strong>Detected peaks:</strong> ${peaks}` +
      `<br><strong>Estimated PIN length:</strong> ${peaks}` +
      `<br><small>Sample: pin-taps-4.wav (4 taps)</small>`
    ),
    'audio.sampleFailed':       () => 'Failed to load the sample audio.',

    // Fingerprint analysis UI.
    'finger.result':            ({digits, threshold}) => (
      `<strong>Detected digits:</strong> ${digits.length ? digits.join(', ') : '(none)'}` +
      `<br><small>Keys with density at or above ${threshold}.</small>`
    ),
    'finger.doneToast':         () => 'Fingerprint analysis complete',
    'finger.clearedToast':      () => 'Cleared fingerprint data.',

    // Thermal analysis UI.
    'thermal.result':           ({digits, orderConfidence, timeS}) => (
      `<strong>Detected digits:</strong> ${digits.length ? digits.join(', ') : '(none)'}` +
      `<br><strong>Order confidence:</strong> ${orderConfidence}%` +
      `<br><small>Elapsed: ${timeS}s, temperature threshold >= 3C.</small>`
    ),
    'thermal.doneToast':        () => 'Thermal analysis complete (decay stopped)',

    // Shoulder surfing UI.
    'video.needInput':          () => 'Enter a PIN on the keypad first.',
    'video.result':             ({pin, digits, angle, pixelErr, confidence}) => (
      `<strong>Input PIN:</strong> ${pin}` +
      `<br><strong>Detected digits:</strong> ${digits.join(', ')}` +
      `<br><strong>Viewpoint:</strong> ${angle === 'top' ? 'Overhead' : 'Tilted'}` +
      `<br><strong>Error:</strong> ${pixelErr}px` +
      `<br><strong>Confidence:</strong> ${confidence}%`
    ),
    'video.doneToast':          () => 'Shoulder-surfing analysis complete',

    // Integration tab.
    'sim.needRun':              () => 'Press "Run simulation" first.',
    'sim.needSim':              () => 'Run the simulation first.',
    'sim.needSimTab':           () => 'Run an analyzer on the Attack simulation tab first.',
    'sim.doneToast':            () => 'All methods integrated.',
    'sim.pushedToast':          () => 'Applied the attack-simulation result.',
    'sim.initial':              () => 'Run each attack method, then press "Integrate all methods".',
    'sim.rankingPlaceholder':   () => 'The ranking appears after analyzers detect candidate digits.',
    'sim.beforeAnalysis':       () => 'Shown after an analysis is run.',

    // Hint lines.
    'hint.riskHigh':            () => (
      '⚠️ <strong>High risk:</strong> Multiple attack methods extracted useful information.' +
      ' The PIN authentication is seriously exposed.'
    ),
    'hint.riskMid':             () => (
      '⚡ <strong>Medium risk:</strong> Some attack methods succeeded.' +
      ' Consider additional defenses.'
    ),
    'hint.riskLow':             () => (
      '✓ <strong>Low risk:</strong> The current attack methods only produced limited information.'
    ),
    'hint.finger':              () => (
      '🔍 <strong>Fingerprint countermeasure:</strong> Wipe the surface after input' +
      ' and use an oleophobic coating.'
    ),
    'hint.thermal':             () => (
      '🌡️ <strong>Thermal countermeasure:</strong> Use dummy keypresses' +
      ' or touch random keys to foil thermal readout.'
    ),
    'hint.audio':               () => (
      '🔊 <strong>Acoustic countermeasure:</strong> Use quiet keypads' +
      ' or mask the input with ambient audio.'
    ),
    'hint.video':               () => (
      '📹 <strong>Shoulder-surfing countermeasure:</strong> Cover the input with your hand' +
      ' and install visual shields on the screen.'
    ),
    'hint.candidateTight':      ({len, total}) => (
      `🎯 <strong>Danger:</strong> Only ${len} candidate digits.` +
      ` A brute force over ${total} combinations is realistic.`
    ),
    'hint.candidateNarrow':     ({len}) => (
      `⚠️ Candidate digits are narrowed down to ${len}.` +
      ' Expand the search space to defend.'
    ),

    // Export / toast.
    'export.sessionDone':       () => 'Exported the session data.',
    'export.simDone':           () => 'Exported the simulation result.',
    'export.csvEmpty':          () => 'No candidates to export.',
    'export.csvDone':           ({total}) => `Exported the candidate list as CSV (${total} items).`,

    // Hand cover mode toasts.
    'cover.on':                 () => 'Hand-cover mode ON: subsequent input is masked.',
    'cover.off':                () => 'Hand-cover mode OFF: already-masked digits stay masked.',
    'cover.cleared':            () => 'Cleared the input.',

    // Candidates area.
    'cand.truncated':           ({remaining, count}) => `... ${remaining} more (out of ${count}).`,
    'cand.csvNote':             () => 'Use the CSV export to see every pattern.',
    'cand.empty':               () => '(The list was skipped for this configuration.)',

    // Steps display helpers.
    'steps.placeholder':        () => 'Run a calculation to see each step here.',

    // Radar labels.
    'radar.finger':             () => 'Fingerprint',
    'radar.thermal':            () => 'Thermal',
    'radar.audio':              () => 'Acoustic',
    'radar.video':              () => 'Video',

    // Result label fragments shared across analyzers.
    'label.detected':           () => 'Detected digits:',
    'label.none':               () => '(none)',
    'label.inputPin':           () => 'Input PIN:',
    'label.viewTop':            () => 'Overhead',
    'label.viewTilt':           () => 'Tilted',

    // --- Static UI strings (index.html, injected via data-i18n) ----------
    'ui.lang':                  () => 'en',
    'ui.title':                 () => 'PIN Threat Simulator - PIN Authentication Attack Simulator',
    'ui.metaDescription':       () => (
      'Educational web simulator for PIN authentication vulnerabilities.' +
      ' Explore fingerprint, thermal, acoustic, and shoulder-surfing attacks safely.'
    ),
    'ui.ogTitle':               () => 'PIN Threat Simulator - Educational',
    'ui.ogDescription':         () => 'Educational only: safely learn how PIN authentication can be attacked.',
    'ui.noscript':              () => 'This tool requires JavaScript. Please enable it in your browser.',
    'ui.appTitle':              () => 'PIN Threat Simulator',
    'ui.appSubtitle':           () => 'Educational simulator for PIN attack techniques and defenses.',
    'ui.themeToggleTitle':      () => 'Toggle theme',
    'ui.langToggleAria':        () => 'Switch language',
    'ui.langToggleTitle':       () => 'Switch language (JA / EN)',
    'ui.langToggleLabel':       () => '🌐 JA',
    'ui.exportSessionTitle':    () => 'Export the full session (calculation settings and simulation results) as JSON.',
    'ui.exportSessionLabel':    () => 'Export session (JSON)',

    'ui.tabsAria':              () => 'Main tabs',
    'ui.tabCalc':               () => 'PIN Pattern Calculation',
    'ui.tabSim':                () => 'Attack Simulation',
    'ui.tabSec':                () => 'Security',

    'ui.digitSetLabel':         () => 'Candidate digit set (click to toggle)',
    'ui.digitSetTooltip':       () => 'Pick digits that may have been detected by attacks. Click to add or remove each.',
    'ui.pinLengthLabel':        () => 'PIN length',
    'ui.pinLengthTooltip':      () => 'Set the PIN length. Use this when acoustic analysis already estimated it.',
    'ui.modeLabel':             () => 'Mode',
    'ui.modeTooltip':           () => (
      'Allowed set: only use the picked digits. Must include: use the picked digits as well.' +
      ' Partial: picked digits are possibilities (0-9 allowed).'
    ),
    'ui.modeAllowed':           () => 'Allowed-set mode (only picked digits)',
    'ui.modeMust':              () => 'Must-include mode (include every picked digit)',
    'ui.modePartial':           () => 'Partial mode (picked digits are possibilities)',
    'ui.allowDupLabel':         () => 'Allow duplicates',
    'ui.allowDupTooltip':       () => 'Whether the same digit can repeat (e.g. 1111 or 1234).',
    'ui.wildcardsLabel':        () => 'Wildcards',
    'ui.wildcardsTooltip':      () => (
      'Use this when some positions are known. Comma-separated. "*" means unknown.' +
      ' Example: "*,*,2,*" fixes the third digit to 2.'
    ),
    'ui.wildcardsPlaceholder':  () => 'e.g. *,*,2,*',

    'ui.calcBtn':               () => 'Calculate',
    'ui.clearBtn':              () => 'Clear',
    'ui.useFromSim':            () => 'Use the attack-simulation result',

    'ui.resultHeading':         () => 'Result',
    'ui.resultTotalLabel':      () => 'Total candidates:',
    'ui.resultLengthLabel':     () => 'Estimated length:',
    'ui.showStepsLabel':        () => 'Show calculation steps (educational)',
    'ui.candidatesHeading':     () => 'Candidate list',
    'ui.csvBtnTitle':           () => 'Export the candidate list as CSV',

    'ui.fingerHeading':         () => '🔍 Fingerprint analysis',
    'ui.fingerTooltip':         () => 'Estimate which keys were pressed from the residue left on the keypad. Click each key to change its density (0-100).',
    'ui.fingerThresholdLabel':  () => 'Detection threshold (>=)',
    'ui.analyzeBtn':            () => 'Analyze',

    'ui.thermalHeading':        () => '🌡️ Thermal analysis',
    'ui.thermalTooltip':        () => 'A thermal camera reads temperature right after input. Pressed keys stay warm, then cool over time.',
    'ui.thermalHelper':         () => 'Click the keypad to enter a PIN, then move the elapsed-time slider to see the decay.',
    'ui.thermalTimeLabel':      () => 'Elapsed time (s)',

    'ui.audioHeading':          () => '🔊 Acoustic analysis',
    'ui.audioTooltip':          () => 'Estimate the PIN length from keypress sound peaks. Click any keypad button, or upload an audio recording.',
    'ui.audioTapCountLabel':    () => 'Keypresses:',
    'ui.audioFileLabel':        () => 'Audio file',
    'ui.audioFileTooltip':      () => 'Upload a recording of the keypress sounds (MP3, WAV, etc.). Peak detection in the waveform estimates the PIN length.',
    'ui.audioSampleBtn':        () => 'Try sample',
    'ui.audioSampleTitle':      () => 'Run the acoustic analyzer on the bundled sample (4 taps, ~1.6s).',

    'ui.videoHeading':          () => '📹 Shoulder-surfing analysis',
    'ui.videoTooltip':          () => 'Simulate camera-based or over-the-shoulder observation. Viewpoint and error change the detection accuracy.',
    'ui.videoPinLabel':         () => 'Input PIN:',
    'ui.videoAngleLabel':       () => 'Viewpoint',
    'ui.videoAngleTooltip':     () => (
      'Overhead: ideal top-mounted camera, every digit visible.' +
      ' Tilted: over-the-shoulder, confidence -30%, up to 50% fewer digits detected.'
    ),
    'ui.videoAngleTop':         () => 'Overhead (high accuracy)',
    'ui.videoAngleTilt':        () => 'Tilted (accuracy -30%, fewer detections)',
    'ui.pixelErrorLabel':       () => 'View-angle error (px)',
    'ui.pixelErrorTooltip':     () => (
      'Coordinate inaccuracy from camera resolution, distance, or shake.' +
      ' 0-20px: only reduces confidence.' +
      ' Over 20px: halves detections and drops confidence sharply.'
    ),

    'ui.analysisHeading':       () => '📊 Integrated analysis',
    'ui.runSim':                () => 'Integrate all methods',
    'ui.exportSim':             () => 'Export',
    'ui.pushToCalc':            () => 'Push to PIN pattern calculation',
    'ui.radarHeading':          () => 'Effectiveness of each method',
    'ui.expertHints':           () => '💡 Expert hints',
    'ui.pinRankingHeading':     () => '🎯 Estimated PIN ranking',
    'ui.simCandidatesLabel':    () => 'Candidate set:',
    'ui.simLengthLabel':        () => 'Estimated length:',
    'ui.simOrderLabel':         () => 'Order confidence:',
    'ui.simInitialHint':        () => 'Run each attack method, then press "Integrate all methods".',
    'ui.rankingInitial':        () => 'Shown after an analysis is run.',

    'ui.secHeading':            () => 'Countermeasures per attack',
    'ui.secFingerTitle':        () => '🔍 Fingerprint analysis',
    'ui.secFingerKnow':         () => 'Known: the set of likely pressed keys.',
    'ui.secFingerUnknown':      () => 'Unknown: the exact order (usually).',
    'ui.secFingerCondition':    () => 'Effective when: the surface is slick and the time window is short.',
    'ui.secThermalTitle':       () => '🌡️ Thermal analysis',
    'ui.secThermalKnow':        () => 'Known: just after input, the temperature difference hints at the order.',
    'ui.secThermalLimit':       () => 'Limits: tricky after some time or when keys are pressed more than once.',
    'ui.secAudioTitle':         () => '🔊 Acoustic analysis',
    'ui.secAudioKnow':          () => 'Known: the number of keypresses (PIN length).',
    'ui.secAudioUnknown':       () => 'Unknown: which digits were pressed (hard with room reverb).',
    'ui.secVideoTitle':         () => '📹 Shoulder-surfing analysis (over-the-shoulder observation)',
    'ui.secVideoKnow':          () => 'Known: the position of the pressed keys, depending on viewpoint and distance.',
    'ui.secVideoLimit':         () => 'Limits: angle, resolution, and hand covering reduce accuracy.',
    'ui.secVideoDefense':       () => 'Defense: cover the input with your hand and tilt the screen.',

    'ui.randomHeading':         () => 'Randomized keypad demo',
    'ui.shuffleBtn':            () => 'Shuffle',
    'ui.resetBtn':              () => 'Reset',
    'ui.inputLabel':            () => 'Input:',
    'ui.clearMiniBtn':          () => 'Clear',
    'ui.handCoverLabel':        () => '✋ Hand-cover mode (mask the digit right after input)',
    'ui.randNote':              () => 'A random layout makes shoulder-surfing and fingerprint attacks harder.',

    'ui.checklistHeading':      () => 'Operational checklist',
    'ui.checklist1':            () => 'Cover the input with your hand or screen the keypad when you type.',
    'ui.checklist2':            () => 'Prefer ATMs with randomized on-screen keypads (where available).',
    'ui.checklist3':            () => 'For critical terminals, require two-factor authentication (card + PIN).',
    'ui.checklist4':            () => 'Clean the surface regularly so no fingerprint traces are left behind.',

    'ui.footer':                () => '🔗 GitHub repository',
  },
};

// Active language state. The host (script.js) may change it with setLang.
let activeLang = 'ja';

export function getLang(){
  return activeLang;
}

export function setLang(lang){
  activeLang = DICT[lang] ? lang : 'ja';
  return activeLang;
}

export function translate(lang, key, params){
  const bag = DICT[lang] || DICT.ja;
  const entry = bag[key] ?? DICT.ja[key];
  if(!entry) return key;
  return typeof entry === 'function' ? entry(params || {}) : String(entry);
}

export function t(key, params){
  return translate(activeLang, key, params);
}

export function translateStep(step){
  return t('step.' + step.key, step.params || {});
}

export default DICT;
