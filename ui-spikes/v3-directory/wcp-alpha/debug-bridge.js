// Optional shared real-device diagnostics. Does not upload settings values.
void import('https://agent-link.laity.bid/device-debug/v1/device-debug.js?v=1.1.0')
  .then(({installDeviceDebug}) => {
    const bridge = installDeviceDebug({appId: 'ocr2md-wcp-alpha'});
    const send = event => bridge.report('wcp_alpha_' + event, {
      version: window.__ocrWcpAlpha?.version || null,
      dirty: Boolean(window.__ocrWcpAlpha?.dirty),
      orientation: matchMedia('(orientation:portrait)').matches ? 'portrait' : 'landscape',
    });
    send('opened');
    for (const event of ['active', 'update-available', 'rollback', 'fallback', 'update-failed']) {
      document.querySelector('#wcp-region')?.addEventListener('wcp:' + event, () => send(event));
    }
  }).catch(() => {});
