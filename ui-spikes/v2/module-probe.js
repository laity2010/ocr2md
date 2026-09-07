fetch("/__debug/runtime", {
  method: "POST",
  credentials: "same-origin",
  keepalive: true,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "standalone_module_started",
    reportedAt: new Date().toISOString(),
    device: /iPhone/i.test(navigator.userAgent)
      ? "iPhone"
      : /iPad/i.test(navigator.userAgent)
        ? "iPad"
        : "browser"
  })
}).catch(() => {});
