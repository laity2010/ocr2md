/** One-shot visual device font check; only when ?fontcheck=1 is present. */
export async function showFontCheck() {
  const sample = '## Andrea Frazzini, David Kabiller & Lasse Heje Pedersen';
  let localStatus = '不可用';
  try {
    const loaded = await document.fonts.load('400 16px "OCR2MD Sarasa"', sample);
    localStatus = loaded.length ? '已匹配' : '未匹配';
  } catch (_) {localStatus = '字体加载失败';}
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const width = family => {
    context.font = `400 16px ${family}`;
    return context.measureText(sample).width.toFixed(1);
  };
  const editor = document.querySelector('.cm-content');
  const computed = getComputedStyle(editor);
  const report = [
    'V6 字体验收 · iPad 实测',
    `视窗 ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio}`,
    `字体 ${computed.fontSize} · 行高 ${computed.lineHeight}`,
    `Sarasa 本地匹配：${localStatus}`,
    `实际样例宽：${width(computed.fontFamily)}px`,
    `Sarasa 别名宽：${width('"OCR2MD Sarasa"')}px`,
    `系统等宽宽：${width('monospace')}px`,
    'Mac Sarasa 参考值：448px',
    `浏览器：${/iPad/.test(navigator.userAgent) ? 'iPad Safari' : 'Mac/其他'}`,
  ];
  const panel = document.createElement('pre');
  panel.id = 'v6-fontcheck';
  panel.style.cssText = 'position:fixed;right:8px;bottom:40px;z-index:10000;max-width:calc(100vw - 16px);padding:10px 12px;border:1px solid #facc80;border-radius:6px;background:#151d2b;color:#fff;font:13px/1.6 monospace;white-space:pre-wrap;pointer-events:none;box-shadow:0 4px 22px #0009';
  panel.textContent = report.join('\n');
  document.body.appendChild(panel);
}
