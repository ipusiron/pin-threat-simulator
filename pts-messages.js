// pts-messages.js
// Centralized string dictionary for PIN Threat Simulator (Japanese, stage-1).
// Pure data + a tiny formatter. Multi-language support will arrive in stage-2.

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

    // Fingerprint analysis UI.
    'finger.result':            ({digits, threshold}) => `<strong>検出された数字:</strong> ${digits.length ? digits.join(', ') : '(なし)'}<br><small>閾値 ${threshold} 以上の濃度を持つキー</small>`,
    'finger.doneToast':         () => '指紋解析完了',
    'finger.clearedToast':      () => '指紋データをクリアしました',

    // Thermal analysis UI.
    'thermal.result':           ({digits, orderConfidence, timeS}) => `<strong>検出された数字:</strong> ${digits.length ? digits.join(', ') : '(なし)'}<br><strong>順序確度:</strong> ${orderConfidence}%<br><small>経過時間: ${timeS}秒、温度閾値 3℃以上</small>`,
    'thermal.doneToast':        () => '熱解析完了（減衰停止）',

    // Shoulder surfing UI.
    'video.needInput':          () => 'テンキーでPINを入力してください',
    'video.result':             ({pin, digits, angle, pixelErr, confidence}) => `<strong>入力PIN:</strong> ${pin}<br><strong>検出された数字:</strong> ${digits.join(', ')}<br><strong>視点:</strong> ${angle === 'top' ? '真上' : '斜め'}<br><strong>誤差:</strong> ${pixelErr}px<br><strong>信頼度:</strong> ${confidence}%`,
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
  },
};

export function translate(lang, key, params){
  const bag = DICT[lang] || DICT.ja;
  const entry = bag[key];
  if(!entry) return key;
  return typeof entry === 'function' ? entry(params || {}) : String(entry);
}

export function t(key, params){
  return translate('ja', key, params);
}

export function translateStep(step){
  return t('step.' + step.key, step.params || {});
}

export default DICT;
