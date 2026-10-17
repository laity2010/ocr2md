function se(a){let e="",s=!1,t=!1;for(let i=0;i<a.length;i++){let r=a[i],n=a[i+1];if(s){e+=r,t?t=!1:r==="\\"?t=!0:r==='"'&&(s=!1);continue}if(r==='"'){s=!0,e+=r;continue}if(r==="/"&&n==="/"){for(e+="  ",i+=2;i<a.length&&a[i]!==`
`&&a[i]!=="\r";)e+=" ",i++;i<a.length&&(e+=a[i]);continue}if(r==="/"&&n==="*"){e+="  ",i+=2;let d=!1;for(;i<a.length;i++){if(a[i]==="*"&&a[i+1]==="/"){e+="  ",i++,d=!0;break}e+=a[i]===`
`||a[i]==="\r"?a[i]:" "}if(!d)throw new SyntaxError("JSON \u6CE8\u91CA\u672A\u7ED3\u675F");continue}e+=r}return e}function R(a){return JSON.parse(se(a))}function j(a,e,{comments:s=!0}={}){let t={};for(let n of e)t[n.id]=structuredClone(a[n.id]);let i=JSON.stringify(t,null,2);if(!s)return i;let r=new Map(e.map(n=>[n.id,n]));return i.split(`
`).map(n=>{let d=/^  ("(?:\\.|[^"\\])*"):\s/.exec(n);if(!d)return n;let o=r.get(JSON.parse(d[1]));if(!o)return n;let l=[o.label,o.description].filter(Boolean).join(" \u2014 ").replace(/[\r\n\u2028\u2029]+/g," ").trim();return l?`  // ${l}
${n}`:n}).join(`
`)}var ae=a=>{let e=String(a||"").trim(),s=/^#([0-9a-f]{3})$/i.exec(e);if(s)return s[1].split("").map(r=>parseInt(r+r,16));let t=/^#([0-9a-f]{6})$/i.exec(e);if(t)return[0,2,4].map(r=>parseInt(t[1].slice(r,r+2),16));let i=/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i.exec(e);if(i){let r=i.slice(1).map(Number);return r.every(n=>n<=255)?r:null}return null},D=a=>"#"+a.map(e=>Math.max(0,Math.min(255,Math.round(e))).toString(16).padStart(2,"0")).join(""),G=(a,e,s)=>D(a.map((t,i)=>t*(1-s)+e[i]*s));function $(a,e){return typeof e=="string"&&(a.cssProperty==="color"||a.target?.type==="css-var"&&a.cssProperty==="color"||/color|colour|颜色|色值/i.test(`${a.id} ${a.label}`)||typeof CSS<"u"&&CSS.supports?.("color",e)===!0&&/^(#|rgba?\(|hsla?\()/i.test(e))}function U(a,e){let s=(a.options??[]).map(d=>typeof d=="object"&&d!==null&&"value"in d?d.value:d).map(String).filter(d=>globalThis.CSS?.supports?.("color",d)),t=Array.isArray(a.recommendedColors)?a.recommendedColors.map(String):[];if(s.length&&!a.allowCustomValue){let d=[...t.filter(o=>s.includes(o)),...s.filter(o=>o!==String(e))];return Array.from({length:3},(o,l)=>d[l]||null)}let i=ae(e)||[131,154,181],r=[G(i,[255,255,255],.25),G(i,[0,0,0],.24),D(i.map(d=>255-d))],n=[...new Set([...t,...r].filter(d=>globalThis.CSS?.supports?.("color",d)))];return Array.from({length:3},(d,o)=>n[o]||null)}function N(a){let e=[],s=0,t=0,i=-1,r=!1,n=!1,d=a.length;for(let o=0;o<a.length;o++){let l=a[o],u=a[o+1];if(r){if(n){n=!1;continue}if(l==="\\"){n=!0;continue}if(l==='"'){if(r=!1,i>=0){let c=o+1;for(;c<a.length&&/\s/.test(a[c]);)c++;if(a[c]===":")try{e.push({key:JSON.parse(a.slice(i,o+1)),from:i,to:o+1,end:a.length})}catch{}}i=-1}continue}if(l==="/"&&u==="/"){for(o+=2;o<a.length&&a[o]!==`
`&&a[o]!=="\r";)o++;continue}if(l==="/"&&u==="*"){for(o+=2;o<a.length;o++)if(a[o]==="*"&&a[o+1]==="/"){o++;break}continue}l==='"'?(r=!0,i=s===1&&t===0?o:-1):l==="{"?s++:l==="}"?(s===1&&t===0&&(d=o),s=Math.max(0,s-1)):l==="["?t++:l==="]"&&(t=Math.max(0,t-1))}return e.forEach((o,l)=>o.end=e[l+1]?.from??d),e}function K(a,e){let s=N(a),t=a.lastIndexOf(`
`,Math.max(0,e-1))+1,i=a.indexOf(`
`,t),r=a.slice(t,i<0?a.length:i);if(/^\s*\/\//.test(r)){let n=s.find(d=>d.from>=e);if(n)return n.key}for(let n=s.length-1;n>=0;n--)if(e>=s[n].from&&e<s[n].end)return s[n].key;return null}var re=/^\s*\/\/ @disabled (".*")\s*$/,ne=/^\s*\/\/ @enddisabled (".*")\s*$/,oe=/^\s*\/\/\| (.*)$/;function w(a,e){let s=R(a);if(!s||Array.isArray(s)||typeof s!="object")throw new SyntaxError("\u8BBE\u7F6E\u6E90\u7801\u5FC5\u987B\u662F JSON \u5BF9\u8C61");let t=new Set(e.map(d=>d.id)),i=new Set,r={},n=a.split(/\r?\n/);for(let d=0;d<n.length;d++){let o=re.exec(n[d]);if(!o)continue;let l=JSON.parse(o[1]);if(typeof l!="string"||!t.has(l))throw new SyntaxError("\u6CE8\u91CA\u4E2D\u5B58\u5728\u672A\u77E5\u53C2\u6570\uFF1A"+String(l));if(i.has(l)||Object.prototype.hasOwnProperty.call(s,l))throw new SyntaxError("\u53C2\u6570\u91CD\u590D\u58F0\u660E\uFF1A"+l);let u=[],c=!1;for(;++d<n.length;){let f=ne.exec(n[d]);if(f){if(JSON.parse(f[1])!==l)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u7ED3\u675F\u6807\u8BB0\u4E0D\u5339\u914D\uFF1A"+l);c=!0;break}let h=oe.exec(n[d]);if(!h)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF1A"+l);u.push(h[1])}if(!c)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u672A\u7ED3\u675F\uFF1A"+l);let g;try{g=JSON.parse(`{
`+u.join(`
`)+`
}`)}catch(f){throw new SyntaxError("\u7981\u7528\u53C2\u6570\u503C\u4E0D\u80FD\u89E3\u6790\uFF1A"+l+"\uFF1A"+f.message)}if(Object.keys(g).length!==1||!Object.prototype.hasOwnProperty.call(g,l))throw new SyntaxError("\u7981\u7528\u53C2\u6570\u7684\u952E\u503C\u4E0D\u5339\u914D\uFF1A"+l);r[l]=g[l],i.add(l)}return{values:{...s,...r},disabled:i}}function I(a,e,{comments:s=!0,disabled:t=new Set}={}){if(!t.size)return j(a,e,{comments:s});let r=e.filter(d=>!t.has(d.id)).map(d=>d.id),n=["{"];for(let d of e){let o=[d.label,d.description].filter(Boolean).join(" \u2014 ").replace(/[\r\n\u2028\u2029]+/g," ").trim();s&&o&&n.push("  // "+o);let l=JSON.stringify({[d.id]:a[d.id]},null,2).split(`
`).slice(1,-1);if(t.has(d.id))n.push("  // @disabled "+JSON.stringify(d.id)),n.push(...l.map(u=>"  //| "+u)),n.push("  // @enddisabled "+JSON.stringify(d.id));else{if(!(r.shift()===d.id))throw Error("\u8BBE\u7F6E\u987A\u5E8F\u5F02\u5E38");r.length&&(l[l.length-1]+=","),n.push(...l)}}return[...n,"}"].join(`
`)}function O(a){let e=[],s=/^\s*\/\/ @disabled (".*")\s*$/gm,t;for(;t=s.exec(a);)try{let i=JSON.parse(t[1]);if(typeof i!="string")continue;let r=t.index+t[0].indexOf("//"),n="// @enddisabled "+JSON.stringify(i),d=a.indexOf(n,t.index+t[0].length);if(d<0)continue;e.push({key:i,from:r,to:r+t[0].length,end:d+n.length,disabled:!0})}catch{}return e}var m="0.1.18",H="laity-shared-settings-v1-style",J="laity-sarasa-ui-font-v1",_=new URL(import.meta.url),F=new URL(_.pathname.includes("/releases/")?"../../manifest.json":"./manifest.json",_).href,Y=new URL("./settings-grid.js",_);Y.search=_.search;var le="https://agent-link.laity.bid/shared-source/v1/source-surface.js?v=0.2.5",de=300*1e3,S=null;function Z(){return S||(S=import(Y.href).catch(a=>{throw S=null,a})),S}function Ae(){return Z().then(()=>{})}function B(a){return String(a??"").split(/[.+-]/).slice(0,3).map(e=>Number.parseInt(e,10)||0)}function ue(a,e){let s=B(a),t=B(e);for(let i=0;i<3;i++)if(s[i]!==t[i])return s[i]>t[i]?1:-1;return 0}function ce(){if(!document.getElementById(J)){let e=document.createElement("link");e.id=J,e.rel="stylesheet",e.href=new URL("./sarasa-ui.css",_).href,e.crossOrigin="anonymous",document.head.append(e)}if(document.getElementById(H))return;let a=document.createElement("style");a.id=H,a.textContent=`
    laity-settings-panel {
      --las-panel-bg: #15181f;
      --las-control-bg: #10141b;
      --las-border: #2a303b;
      --las-fg: #eef2f7;
      --las-muted: #8f99aa;
      --las-soft: #b4bdca;
      --las-accent: #668ac8;
      --las-danger: #ff7474;
      --las-font-family: var(--laity-ui-font, "Sarasa Fixed SC", "Sarasa Mono SC", ui-monospace, monospace);
      display: block;
      color: var(--las-fg);
      font-family: var(--las-font-family);
    }
    laity-settings-panel *, laity-settings-panel *::before, laity-settings-panel *::after { box-sizing: border-box; }
    laity-settings-panel :is(button,input,select,textarea,option,code,pre),
    laity-settings-panel :is(.las-grid,.las-preview,.las-head,.las-source-head) {
      font-family: var(--las-font-family);
    }
    laity-settings-panel .las-source { font-family: var(--las-font-family); }
    laity-settings-panel .las-shell {
      display: grid;
      grid-template-rows: auto minmax(240px, 1.05fr) auto minmax(180px, .95fr) minmax(145px, .6fr);
      gap: 12px;
      min-height: 690px;
      height: min(78svh, 920px);
      padding: 16px;
      border: 1px solid var(--las-border);
      border-radius: 18px;
      background: var(--las-panel-bg);
      overflow: hidden;
    }
    laity-settings-panel .las-head,
    laity-settings-panel .las-source-head {
      display: flex;
      gap: 14px;
      align-items: end;
      justify-content: space-between;
      min-width: 0;
    }
    laity-settings-panel .las-title-wrap { min-width: 0; }
    laity-settings-panel .las-kicker {
      margin: 0 0 4px;
      color: var(--las-muted);
      font: 600 11px/1.2 var(--las-font-family);
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    laity-settings-panel .las-title { margin: 0; font-size: 20px; letter-spacing: -.02em; }
    laity-settings-panel .las-toolbar,
    laity-settings-panel .las-source-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    laity-settings-panel button {
      min-height: 34px;
      border: 1px solid var(--las-border);
      border-radius: 9px;
      background: var(--las-control-bg);
      color: var(--las-fg);
      padding: 6px 10px;
      font: inherit;
    }
    laity-settings-panel button { cursor: pointer; }
    laity-settings-panel button:hover { border-color: var(--las-accent); }
    laity-settings-panel button:disabled { opacity: .45; cursor: default; }
    laity-settings-panel .las-status {
      max-width: 380px;
      color: var(--las-muted);
      font-size: 12px;
      text-align: right;
    }
    laity-settings-panel .las-status[data-kind="error"] { color: var(--las-danger); }
    laity-settings-panel .las-status[data-kind="ok"] { color: #8bd19d; }
    laity-settings-panel .las-update {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 5px 4px 9px;
      border: 1px solid color-mix(in srgb, var(--las-accent) 58%, var(--las-border));
      border-radius: 9px;
      background: color-mix(in srgb, var(--las-accent) 15%, transparent);
      color: var(--las-soft);
      font-size: 12px;
      white-space: nowrap;
    }
    laity-settings-panel .las-update[hidden] { display: none; }
    laity-settings-panel .las-update button {
      min-height: 28px;
      padding: 3px 8px;
      border-color: color-mix(in srgb, var(--las-accent) 72%, var(--las-border));
    }
    laity-settings-panel .ag-header-cell-filter-button {
      min-width: 28px;
      min-height: 28px;
      align-items: center;
      justify-content: center;
    }
    laity-settings-panel .las-grid {
      width: 100%;
      min-height: 0;
      border: 1px solid var(--las-border);
      border-radius: 12px;
      overflow: hidden;
    }
    laity-settings-panel .las-enabled-toggle{
      display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;
    }
    laity-settings-panel .las-enabled-toggle input{
      width:17px;height:17px;accent-color:var(--las-accent);cursor:pointer;
    }
    laity-settings-panel .ag-row.las-setting-disabled .ag-cell:not([col-id="enabled"]){
      opacity:.54;
    }
    laity-settings-panel .las-source-title { margin: 0 0 2px; font-size: 15px; }
    laity-settings-panel .las-source-note { margin: 0; color: var(--las-muted); font-size: 12px; }
    laity-settings-panel .las-source {
      width: 100%;
      height: 100%;
      min-height: 220px;
      resize: none;
      border: 1px solid var(--las-border);
      border-radius: 12px;
      background: #0b0e13;
      color: #dfe6ef;
      padding: 13px 14px;
      outline: none;
      font: 12.5px/1.55 var(--las-font-family);
      tab-size: 2;
    }
    /* Native parameter-preview track, inside shared settings only. */
    laity-settings-panel .las-preview{
      display:flex;flex-direction:column;gap:6px;min-height:120px;overflow:auto;
      padding:10px 13px 12px;border-top:1px solid var(--las-border);
      background:var(--las-control-bg);
      font-size:12px;color:var(--las-fg);
    }
    laity-settings-panel .las-preview-header{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    laity-settings-panel .las-preview-title{font-size:13px;font-weight:600}
    laity-settings-panel .las-preview-key{font:11px/1.4 var(--las-font-family);color:var(--las-muted)}
    laity-settings-panel .las-preview-note{line-height:1.5;color:var(--las-soft);overflow-wrap:anywhere}
    laity-settings-panel .las-preview-facts{display:grid;grid-template-columns:minmax(68px,auto) minmax(0,1fr);
      gap:5px 12px;margin:4px 0 6px;align-items:start}
    laity-settings-panel .las-preview-facts dt{color:var(--las-muted);font-size:11px}
    laity-settings-panel .las-preview-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
    laity-settings-panel .las-preview-value{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;
      word-break:break-word;font:12px/1.5 var(--las-font-family)}
    laity-settings-panel .las-preview-definition{margin:2px 0 8px}
    laity-settings-panel .las-preview-definition summary{cursor:pointer;color:var(--las-soft);font-size:11px}
    laity-settings-panel .las-preview-current{display:flex;align-items:center;gap:10px;font:12px/1.4 var(--las-font-family);overflow-wrap:anywhere}
    laity-settings-panel .las-preview-swatch{width:54px;height:40px;flex:0 0 auto;border:1px solid var(--las-border);border-radius:6px;
      background-image:linear-gradient(45deg,#777 25%,transparent 25%),linear-gradient(-45deg,#777 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#777 75%),linear-gradient(-45deg,transparent 75%,#777 75%);
      background-size:10px 10px;background-position:0 0,0 5px,5px -5px,-5px 0;
    }
    laity-settings-panel .las-preview-options{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}
    laity-settings-panel .las-preview-choice{display:flex;flex-direction:column;align-items:center;gap:4px;
      min-width:86px;min-height:64px;font-size:11px;padding:5px;border:1px solid var(--las-border);border-radius:7px}
    laity-settings-panel .las-preview-choice > i{width:60px;height:26px;border-radius:4px;border:1px solid #ffffff50;display:block}
    laity-settings-panel .las-preview-choice[aria-pressed="true"]{outline:2px solid var(--las-accent)}
    laity-settings-panel .las-preview-choice:disabled{cursor:not-allowed;opacity:.5}
    laity-settings-panel .las-preview-bool{display:flex;gap:8px}
    laity-settings-panel .las-preview-bool button{min-width:92px}
    laity-settings-panel .las-preview-bool button[aria-pressed="true"]{border-color:var(--las-accent);background:color-mix(in srgb,var(--las-accent) 24%,var(--las-control-bg))}
    laity-settings-panel[layout="horizontal"] .las-preview{
      flex:0 0 var(--las-preview-height,30%);max-height:65%;min-height:135px;
    }
    laity-settings-panel .las-preview-divider{display:none}
    laity-settings-panel[layout="horizontal"] .las-preview-divider{
      display:block;flex:0 0 8px;background:#364659;cursor:row-resize;
      touch-action:none;user-select:none;border:0;
    }
    laity-settings-panel[layout="horizontal"] .las-preview-divider:hover,
    laity-settings-panel[layout="horizontal"] .las-preview-divider:focus-visible{
      background:#8cbef4;outline:0;
    }
    laity-settings-panel[layout="horizontal"] .las-code-host{
      min-height:0;flex:1;overflow:hidden;position:relative;
    }
    laity-settings-panel[layout="horizontal"] .las-code-host laity-source-surface{
      min-height:0;min-width:0;height:100%;overflow:hidden;
    }
    laity-settings-panel[layout="horizontal"] .las-source{min-height:0;flex:1}
    laity-settings-panel[layout="horizontal"] .las-preview{
      border-radius:0;position:relative;z-index:1;flex-shrink:0;
    }
    laity-settings-panel .las-preview[hidden]{display:none}
    laity-settings-panel .las-source:focus {
      border-color: var(--las-accent);
      box-shadow: 0 0 0 1px var(--las-accent);
    }
    @media (max-width: 760px) {
      laity-settings-panel .las-shell {
        height: auto;
        min-height: 760px;
        grid-template-rows: auto 280px auto 230px 180px;
        padding: 12px;
      }
      laity-settings-panel .las-head,
      laity-settings-panel .las-source-head {
        align-items: stretch;
        flex-direction: column;
      }
      laity-settings-panel .las-status { max-width: none; text-align: left; }
    }
    .las-enum-filter {
      min-width: 190px;
      max-width: 280px;
      max-height: 320px;
      overflow: auto;
      padding: 8px;
      background: var(--las-panel-bg, #15181f);
      color: var(--las-fg, #eef2f7);
    }
    .las-enum-filter-option {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 2px 4px;
      white-space: nowrap;
    }
    .las-enum-filter-option input { flex: 0 0 auto; }
    .las-enum-filter-option span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .las-enum-filter-all { font-weight: 600; }
    .las-enum-filter-divider {
      height: 1px;
      margin: 5px 0;
      background: var(--las-border, #2a303b);
    }
    .las-color-value {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .las-color-swatch {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      border: 1px solid color-mix(in srgb, var(--las-fg, #eef2f7) 34%, transparent);
      border-radius: 4px;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .16);
    }
    .las-color-value-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .las-color-value-code {
      flex: 0 0 auto;
      color: var(--las-muted, #8f99aa);
      font: 11.5px/1.2 var(--las-font-family);
    }
    .las-color-editor {
      min-width: 250px;
      max-width: min(360px, calc(100vw - 24px));
      max-height: 320px;
      overflow: auto;
      padding: 6px;
      border: 1px solid var(--las-border, #2a303b);
      border-radius: 10px;
      background: var(--las-control-bg, #10141b);
      color: var(--las-fg, #eef2f7);
      box-shadow: 0 14px 34px rgba(0, 0, 0, .36);
    }
    .las-color-option {
      width: 100%;
      min-height: 36px;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      padding: 6px 8px;
      text-align: left;
      cursor: pointer;
    }
    .las-color-option:hover,
    .las-color-option:focus-visible {
      outline: none;
      background: color-mix(in srgb, var(--las-accent, #668ac8) 18%, transparent);
    }
    .las-color-option[aria-selected="true"] {
      background: color-mix(in srgb, var(--las-accent, #668ac8) 24%, transparent);
    }
    .las-color-option .las-color-value-label { font: inherit; }
    .las-custom-value-editor {
      min-width: 280px;
      max-width: min(420px, calc(100vw - 24px));
      max-height: 360px;
      overflow: auto;
      padding: 8px;
      border: 1px solid var(--las-border, #2a303b);
      border-radius: 10px;
      background: var(--las-control-bg, #10141b);
      color: var(--las-fg, #eef2f7);
      box-shadow: 0 14px 34px rgba(0, 0, 0, .36);
    }
    .las-custom-value-input {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--las-border, #2a303b);
      border-radius: 8px;
      background: #0b0e13;
      color: var(--las-fg, #eef2f7);
      padding: 8px 10px;
      outline: none;
      font: 13px/1.4 var(--las-font-family);
      -webkit-user-select: text;
      user-select: text;
    }
    .las-custom-value-input:focus {
      border-color: var(--las-accent, #668ac8);
      box-shadow: 0 0 0 1px var(--las-accent, #668ac8);
    }
    .las-custom-value-hint {
      margin: 7px 2px 6px;
      color: var(--las-muted, #8f99aa);
      font-size: 11px;
    }
    .las-custom-value-option {
      width: 100%;
      min-height: 34px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      padding: 5px 8px;
      text-align: left;
      cursor: pointer;
    }
    .las-custom-value-option:hover,
    .las-custom-value-option:focus-visible {
      outline: none;
      background: color-mix(in srgb, var(--las-accent, #668ac8) 18%, transparent);
    }
    .las-custom-value-option[aria-selected="true"] {
      background: color-mix(in srgb, var(--las-accent, #668ac8) 24%, transparent);
    }

    /* Optional Workbench-style AG | source layout. Existing vertical callers
       keep the original four-row arrangement (backward compatible). */
    laity-settings-panel[layout="horizontal"] .las-shell{
      display:flex;flex-direction:row;gap:0;padding:0;border:0;
      border-radius:0;min-height:0;height:100%;width:100%;overflow:hidden;
    }
    laity-settings-panel .las-grid-col,
    laity-settings-panel .las-source-col{display:contents}
    laity-settings-panel .las-app-footer{display:none}
    laity-settings-panel .las-divider{display:none}
    laity-settings-panel[layout="horizontal"] .las-grid-col{
      display:flex;flex:0 0 var(--las-left-width,43%);
      flex-direction:column;min-width:0;min-height:0;overflow:hidden;
    }
    laity-settings-panel[layout="horizontal"] .las-source-col{
      display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;overflow:hidden;
    }
    laity-settings-panel[layout="horizontal"] .las-head{padding:5px;align-items:center}
    laity-settings-panel[layout="horizontal"] .las-title{font-size:13px}
    laity-settings-panel[layout="horizontal"] .las-kicker{font-size:10px}
    laity-settings-panel[layout="horizontal"] .las-toolbar{gap:3px}
    laity-settings-panel[layout="horizontal"] .las-toolbar button{padding:3px 7px;min-height:27px;font-size:11px}
    laity-settings-panel[layout="horizontal"] .las-grid{flex:1;min-height:0;border-radius:0}
    laity-settings-panel[layout="horizontal"] .las-source-head{padding:4px 8px;align-items:center}
    laity-settings-panel[layout="horizontal"] .las-source-note{display:none}
    laity-settings-panel[layout="horizontal"] .las-source-title{font-size:13px}
    laity-settings-panel[layout="horizontal"] .las-source-actions button{min-height:27px;padding:3px 6px;font-size:11px}
    laity-settings-panel[layout="horizontal"] .las-source{flex:1;min-height:0;resize:none;border-radius:0}
    laity-settings-panel[layout="horizontal"] .las-divider{
      display:block;flex:0 0 8px;background:#364659;cursor:col-resize;
      touch-action:none;user-select:none;
    }
    laity-settings-panel[layout="horizontal"] .las-divider:hover,
    laity-settings-panel[layout="horizontal"] .las-divider:focus-visible{background:#8cbef4;outline:0}
    laity-settings-panel[layout="horizontal"] .las-app-footer{
      display:block;max-height:33%;overflow:auto;min-height:0;padding:4px 8px;border-top:1px solid var(--las-border);
    }
    laity-settings-panel .las-code-host{display:none;min-height:0}
    laity-settings-panel[source-editor="codemirror"] .las-code-host{display:flex;flex:1;min-height:0}
    laity-settings-panel[source-editor="codemirror"] .las-source{display:none}
    laity-settings-panel[chrome="external"] .las-toolbar button,
    laity-settings-panel[chrome="external"] .las-source-actions{display:none}
    laity-settings-panel[source-editor="codemirror"] .las-code-host laity-source-surface{
      display:block;flex:1;min-width:0;min-height:0;
      --lss-bg:var(--las-panel-bg);--lss-fg:var(--las-fg);
      --lss-font-family:var(--las-font-family);
      --lss-font-size:var(--las-source-font-size,13px);--lss-line-height:var(--las-source-line-height,1.5);
      --lss-group-color:var(--las-accent);
      --lss-caret:#0a84ff;
    }
    laity-settings-panel .las-grid .ag-row.las-linked-row{
      background:color-mix(in srgb,var(--las-accent) 22%,var(--las-panel-bg))!important;
      box-shadow:inset 3px 0 var(--las-accent);
    }
    laity-settings-panel[layout="horizontal"] .las-app-footer details{font-size:12px}
    /* Public external-layout API v1. The source component owns all its private
       pane selectors; consumers receive DOM slots through getLayoutSlots(). */
    laity-settings-panel[data-laity-layout="external"] .las-shell{
      position:relative!important;display:block!important;min-height:0!important;
      width:100%!important;height:100%!important;padding:0!important;overflow:hidden!important;
    }
    laity-settings-panel[data-laity-layout="external"] .las-divider,
    laity-settings-panel[data-laity-layout="external"] .las-preview-divider{display:none!important}
    laity-settings-panel[data-laity-layout="external"] .las-grid-col,
    laity-settings-panel[data-laity-layout="external"] .las-source-col{
      display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
      width:100%!important;height:100%!important;min-height:0!important;min-width:0!important;
      max-width:none!important;overflow:hidden!important;
    }
    laity-settings-panel[data-laity-layout="external"] .las-preview{
      display:flex!important;flex:1 1 auto!important;position:static!important;
      height:100%!important;max-height:none!important;min-height:0!important;
      min-width:0!important;width:100%!important;overflow:auto!important;border-top:0!important;
    }
    laity-settings-panel[data-laity-layout="external"] .wcp-tripane-slot{min-height:0;min-width:0}
    @media(max-width:760px){
      laity-settings-panel[layout="horizontal"] .las-shell{flex-direction:column;}
      laity-settings-panel[layout="horizontal"] .las-grid-col{flex:0 0 var(--las-mobile-top,34%);}
      laity-settings-panel[layout="horizontal"] .las-source-col{flex:1;min-height:180px;}
      laity-settings-panel[layout="horizontal"] .las-divider{cursor:row-resize;}
    }
  `,document.head.append(a)}function p(a){return a==null?a:structuredClone(a)}function he(a){if(Array.isArray(a))return a;if(a&&Array.isArray(a.settings))return a.settings;throw new Error("settings schema must be an array or {settings:[...]}")}function k(a){return(a.options??[]).map(e=>e&&typeof e=="object"&&!Array.isArray(e)&&"value"in e?{label:String(e.label??e.value),value:e.value}:{label:String(e),value:e})}function Q(a){if(typeof a!="string")return!1;let e=a.trim();return e?globalThis.CSS?.supports?.("color",e)===!0:!1}function X(a){let e=k(a);return e.length>0&&e.every(s=>Q(String(s.value)))}function M(a,e,{showCode:s=!0}={}){let t=document.createElement("span");t.className="las-color-value";let i=document.createElement("span");i.className="las-color-swatch",i.style.background=String(e),i.setAttribute("aria-hidden","true");let r=document.createElement("span");if(r.className="las-color-value-label",r.textContent=String(a??e),t.append(i,r),s){let n=document.createElement("span");n.className="las-color-value-code",n.textContent=String(e),t.append(n)}return t}function x(a){if(a.type)return a.type;let e=a.defaultValue;return Array.isArray(e)||e&&typeof e=="object"?"json":typeof e=="boolean"?"boolean":typeof e=="number"?"number":"string"}function z(a){let e=x(a);return a.editor==="source"||a.editor==="textarea"||e==="json"||e==="object"||e==="array"}function A(a,e){return JSON.stringify(a)===JSON.stringify(e)}function ee(a,e){let s=k(a);if(s.length){let i=s.find(r=>String(r.value)===String(e));if(i)return p(i.value)}let t=x(a);if(t==="boolean"){if(e===!0||e==="true"||e===1||e==="1")return!0;if(e===!1||e==="false"||e===0||e==="0")return!1;throw new Error("\u9700\u8981\u5E03\u5C14\u503C true / false")}if(t==="number"||t==="integer"){let i=Number(e);if(!Number.isFinite(i))throw new Error("\u9700\u8981\u6570\u5B57");if(t==="integer"&&!Number.isInteger(i))throw new Error("\u9700\u8981\u6574\u6570");return i}if(t==="json"||t==="object"||t==="array"){let i=typeof e=="string"?JSON.parse(e):p(e);if(t==="object"&&(!i||Array.isArray(i)||typeof i!="object"))throw new Error("\u9700\u8981 JSON \u5BF9\u8C61");if(t==="array"&&!Array.isArray(i))throw new Error("\u9700\u8981 JSON \u6570\u7EC4");return i}return String(e??"")}function te(a,e){if(a.required&&(e===""||e==null))return"\u4E0D\u80FD\u4E3A\u7A7A";let s=k(a),t=s.some(r=>A(r.value,e));if(s.length&&!t&&!a.allowCustomValue)return"\u4E0D\u5728\u5141\u8BB8\u9009\u9879\u4E2D";let i=x(a);if(i==="string"){if(typeof e!="string")return"\u9700\u8981\u5B57\u7B26\u4E32";if(a.pattern)try{if(!new RegExp(a.pattern).test(e))return"\u4E0D\u7B26\u5408\u683C\u5F0F\u8981\u6C42"}catch{return"schema pattern \u65E0\u6548"}}if((i==="number"||i==="integer")&&typeof e=="number"){if(a.min!=null&&e<a.min)return`\u4E0D\u80FD\u5C0F\u4E8E ${a.min}`;if(a.max!=null&&e>a.max)return`\u4E0D\u80FD\u5927\u4E8E ${a.max}`}if(a.target?.type==="css-var"){if(!/^--[a-z0-9_-]+$/i.test(a.target.key??""))return"CSS \u53D8\u91CF\u540D\u65E0\u6548";if(typeof e!="string"&&typeof e!="number")return"CSS \u53D8\u91CF\u503C\u5FC5\u987B\u662F\u6587\u672C\u6216\u6570\u5B57";if(/[{}<>;]/.test(String(e)))return"CSS \u53D8\u91CF\u503C\u5305\u542B\u4E0D\u5141\u8BB8\u5B57\u7B26";let r=String(a.cssProperty??"").trim();if(r&&globalThis.CSS?.supports&&!globalThis.CSS.supports(r,String(e)))return`\u4E0D\u662F\u5408\u6CD5\u7684 ${r} \u503C`;if(a.allowCustomValue&&X(a)&&!Q(String(e)))return"\u9700\u8981\u5408\u6CD5\u7684 CSS \u989C\u8272\u503C"}return null}function pe(a){let e=new Set;return he(a).map((s,t)=>{if(!s||typeof s!="object"||Array.isArray(s))throw new Error(`schema #${t+1} \u4E0D\u662F\u5BF9\u8C61`);let i=String(s.id??"").trim();if(!i)throw new Error(`schema #${t+1} \u7F3A\u5C11 id`);if(e.has(i))throw new Error(`\u91CD\u590D\u8BBE\u7F6E id: ${i}`);e.add(i);let r=String(s.theme??s.domain??"\u5E94\u7528");return{...s,id:i,theme:r,domain:r,category:String(s.category??"\u901A\u7528"),group:String(s.group??"\u5176\u4ED6"),component:String(s.component??s.module??s.group??s.theme??"\u5E94\u7528"),featureGroup:String(s.featureGroup??s.category??"\u901A\u7528"),label:String(s.label??i),description:String(s.description??""),readOnly:!!s.readOnly,allowCustomValue:!!s.allowCustomValue,cssProperty:s.cssProperty==null?"":String(s.cssProperty),defaultValue:p(s.defaultValue??"")}})}function q(a){return Object.fromEntries(a.map(e=>[e.id,p(e.defaultValue)]))}function E(a,e,{strictUnknown:s=!1,currentValues:t=null}={}){let i=e&&typeof e=="object"&&!Array.isArray(e)?e:{},r=new Set(a.map(o=>o.id)),n=[];if(s)for(let o of Object.keys(i))r.has(o)||n.push(`\u672A\u66B4\u9732\u7684\u8BBE\u7F6E\uFF1A${o}`);let d={};for(let o of a){let l=Object.prototype.hasOwnProperty.call(i,o.id)?i[o.id]:p(o.defaultValue);o.readOnly&&t&&Object.prototype.hasOwnProperty.call(t,o.id)&&(A(l,t[o.id])||n.push(`${o.label} \u662F\u53EA\u8BFB\u8BBE\u7F6E`),l=p(t[o.id]));try{l=ee(o,l)}catch(c){n.push(`${o.label}: ${c.message}`),l=p(o.defaultValue)}let u=te(o,l);u&&n.push(`${o.label}: ${u}`),d[o.id]=l}return{values:d,errors:n}}async function W(a){let e=await fetch(a,{cache:"no-store",credentials:"same-origin"});if(!e.ok)throw new Error(`${e.status} ${e.statusText}`);return e.json()}var v=class{constructor(){this.params=null,this.gui=document.createElement("div"),this.selected=null,this.values=[]}init(e){this.params=e,this.gui.className="las-enum-filter",this._refreshValues(),this._render()}getGui(){return this.gui}isFilterActive(){return this.selected!==null}doesFilterPass(e){if(this.selected===null)return!0;let s=String(this.params.getValue(e.node)??"");return this.selected.has(s)}getModel(){return this.selected===null?null:{values:[...this.selected]}}setModel(e){this.selected=e?.values?new Set(e.values):null,this._refreshValues(),this._render()}afterGuiAttached(){this._refreshValues(),this._render()}onNewRowsLoaded(){this._refreshValues(),this._normaliseSelection(),this._render()}_refreshValues(){let e=new Set;this.params.api.forEachLeafNode(s=>{e.add(String(this.params.getValue(s)??""))}),this.values=[...e].sort((s,t)=>s.localeCompare(t,"zh-CN"))}_normaliseSelection(){if(this.selected===null)return;let e=new Set(this.values);this.selected=new Set([...this.selected].filter(s=>e.has(s))),this.values.length>0&&this.selected.size===this.values.length&&(this.selected=null)}_render(){this.gui.replaceChildren();let e=document.createElement("label");e.className="las-enum-filter-option las-enum-filter-all";let s=document.createElement("input");s.type="checkbox",s.checked=this.selected===null,s.setAttribute("aria-label","All");let t=document.createElement("span");t.textContent="All",s.addEventListener("change",()=>{this.selected=s.checked?null:new Set,this.params.filterChangedCallback(),this._render()}),e.append(s,t),this.gui.append(e);let i=document.createElement("div");i.className="las-enum-filter-divider",this.gui.append(i);for(let r of this.values){let n=document.createElement("label");n.className="las-enum-filter-option";let d=document.createElement("input");d.type="checkbox",d.checked=this.selected===null||this.selected.has(r),d.setAttribute("aria-label",r);let o=document.createElement("span");o.textContent=r,d.addEventListener("change",()=>{let l=this.selected===null?new Set(this.values):new Set(this.selected);d.checked?l.add(r):l.delete(r),this.selected=l.size===this.values.length?null:l,this.params.filterChangedCallback(),this._render()}),n.append(d,o),this.gui.append(n)}}},V=class{constructor(){this.params=null,this.value="",this.gui=document.createElement("div")}init(e){this.params=e,this.value=e.value,this.gui.className="las-color-editor ag-custom-component-popup",this.gui.setAttribute("role","listbox"),this.gui.setAttribute("aria-label","\u989C\u8272\u9009\u9879");for(let s of e.options??[]){let t=document.createElement("button");t.type="button",t.className="las-color-option",t.setAttribute("role","option"),t.setAttribute("aria-selected",String(String(s.value)===String(this.value)));let i=M(s.label,s.value);t.append(...i.childNodes),t.addEventListener("pointerdown",r=>{r.preventDefault(),this.value=s.value,this.params.stopEditing()}),t.addEventListener("keydown",r=>{r.key==="Escape"&&(r.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(t)}}getGui(){return this.gui}getValue(){return this.value}isPopup(){return!0}getPopupPosition(){return"under"}afterGuiAttached(){(this.gui.querySelector('[aria-selected="true"]')||this.gui.querySelector("button"))?.focus({preventScroll:!0})}},L=class{constructor(){this.params=null,this.value="",this.gui=document.createElement("div"),this.input=document.createElement("input")}init(e){this.params=e,this.value=String(e.value??""),this.gui.className="las-custom-value-editor ag-custom-component-popup",this.input.className="las-custom-value-input",this.input.type="text",this.input.value=this.value,this.input.autocomplete="off",this.input.spellcheck=!1,this.input.setAttribute("aria-label","\u81EA\u5B9A\u4E49\u53C2\u6570\u503C"),this.input.addEventListener("input",()=>{this.value=this.input.value}),this.input.addEventListener("keydown",t=>{t.key==="Enter"?(t.preventDefault(),this.value=this.input.value,this.params.stopEditing()):t.key==="Escape"&&(t.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(this.input);let s=document.createElement("p");s.className="las-custom-value-hint",s.textContent="\u53EF\u76F4\u63A5\u8F93\u5165\u5408\u6CD5\u503C\uFF1B\u4E0B\u65B9\u662F\u5E38\u7528\u5019\u9009\u3002",this.gui.append(s);for(let t of e.options??[]){let i=document.createElement("button");if(i.type="button",i.className="las-custom-value-option",i.setAttribute("aria-selected",String(String(t.value)===String(this.value))),e.colorOptions){let r=M(t.label,t.value);i.append(...r.childNodes)}else i.textContent=String(t.label??t.value);i.addEventListener("pointerdown",r=>{r.preventDefault(),this.value=t.value,this.input.value=String(t.value),this.params.stopEditing()}),i.addEventListener("keydown",r=>{r.key==="Escape"&&(r.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(i)}}getGui(){return this.gui}getValue(){return this.value}isPopup(){return!0}getPopupPosition(){return"under"}afterGuiAttached(){this.input.focus({preventScroll:!0}),this.input.setSelectionRange?.(0,this.input.value.length)}},P=class extends HTMLElement{constructor(){super(),this._schema=[],this._values={},this._disabledIds=new Set,this._gridApi=null,this._activeKey=null,this._codeSurface=null,this._parameterNameMode="label",this._componentCatalog=[],this._updatingSource=!1,this._sourceExtension=null,this._sourceTimer=null,this._historyPast=[],this._historyFuture=[],this._historyCurrent=null,this._lastHistoryKind=null,this._lastHistoryAt=0,this._loading=!1,this._saveInFlight=0,this._latestVersion=m,this._updateTimer=null,this._onVisibilityChange=()=>{document.visibilityState==="visible"&&this._checkForUpdate()}}connectedCallback(){this.dataset.laityMounted!=="1"&&(this.dataset.laityMounted="1",ce(),this._render(),this._mountSourceSurface(),this.reload(),this._startUpdateWatch())}disconnectedCallback(){clearTimeout(this._sourceTimer),clearInterval(this._updateTimer),document.removeEventListener("visibilitychange",this._onVisibilityChange),this._gridApi?.destroy(),this._gridApi=null}validateValues=null;initialValues=null;get isLayoutReady(){return this.dataset.ready==="true"&&this.dataset.sourceReady==="true"&&!!(this._gridApi&&this._codeSurface)}getLayoutSlots(){if(!this.isLayoutReady)return null;let e=this.querySelector(".las-shell");return!e||!this._els?.grid||!this._els?.preview?null:Object.freeze({host:e,ag:this.querySelector(".las-grid-col"),source:this.querySelector(".las-source-col"),preview:this._els.preview})}setExternalLayout(e=!0){e?this.dataset.laityLayout="external":delete this.dataset.laityLayout;let s=this.querySelector(".las-shell");return s&&e&&s.style.setProperty("position","relative","important"),this.getLayoutSlots()}setParameterNameMode(e="label"){if(e!=="id"&&e!=="label")throw new TypeError("SETTINGS_PARAMETER_NAME_MODE_INVALID");this._parameterNameMode=e,this._gridApi&&(this._gridApi.refreshCells({force:!0}),this._gridApi.onFilterChanged())}setColumnOrder(e){if(!Array.isArray(e)||e.some(s=>typeof s!="string"))throw new TypeError("SETTINGS_COLUMN_ORDER_INVALID");this._requestedColumnOrder=[...e],this._gridApi&&this._gridApi.applyColumnState({state:e.map(s=>({colId:s})),applyOrder:!0})}setComponentCatalog(e=[]){if(!Array.isArray(e))throw new TypeError("SETTINGS_COMPONENT_CATALOG_ARRAY_REQUIRED");let s=new Set,t=[];for(let i of e){let r=i?.id,n=i?.name;if(typeof r!="string"||!/^[-a-z0-9]+:[-a-z0-9]+$/.test(r)||typeof n!="string"||!n.trim())throw new TypeError("SETTINGS_COMPONENT_CATALOG_INVALID");s.has(r)||(s.add(r),t.push(Object.freeze({id:r,name:n.trim()})))}this._componentCatalog=t,this._refreshGrid()}getComponentRows(){return this._rows().map(e=>Object.freeze({componentModule:e.componentModule??"",featureGroup:e.featureGroup??"",enabled:e.componentPlaceholder?null:e.enabled??null,parameterName:e.componentPlaceholder?"":this._parameterNameMode==="id"?e.id:e.parameterName,value:e.componentPlaceholder?"":e.value??"",placeholder:!!e.componentPlaceholder}))}getVisibleSettingIds(){return this._schema.map(e=>e.id)}getParameterNames(){return this._schema.map(e=>this._parameterNameMode==="id"?e.id:e.label)}get explicitSave(){return this.getAttribute("commit-mode")==="explicit"}get values(){return p(this._values)}get disabledIds(){return[...this._disabledIds]}get activeValues(){return Object.fromEntries(Object.entries(this._values).filter(([e])=>!this._disabledIds.has(e)))}get sourceText(){return this._els?.source?.value??""}get sourceComments(){return this.getAttribute("source-comments")!=="false"&&(this.getAttribute("source-comments")==="true"||this.getAttribute("source-editor")==="codemirror"||this.getAttribute("layout")==="horizontal")}async save(){return this._saveSource()}get canUndo(){return this._historyPast.length>0}get canRedo(){return this._historyFuture.length>0}_snapshot(){return{values:p(this._values),disabledIds:[...this._disabledIds],source:this._els?.source?.value??""}}_announceHistory(){this._els?.undo&&(this._els.undo.disabled=!this.canUndo,this._els.redo.disabled=!this.canRedo),this.dispatchEvent(new CustomEvent("laity-settings-history",{bubbles:!0,composed:!0,detail:{canUndo:this.canUndo,canRedo:this.canRedo}}))}_resetHistory(){this._historyPast=[],this._historyFuture=[],this._historyCurrent=this._snapshot(),this._lastHistoryKind=null,this._lastHistoryAt=0,this._announceHistory()}_recordEdit(e){let s=this._snapshot(),t=this._historyCurrent;if(!t){this._historyCurrent=s,this._announceHistory();return}if(JSON.stringify(s)===JSON.stringify(t))return;let i=Date.now();e==="source"&&this._lastHistoryKind==="source"&&i-this._lastHistoryAt<700&&this._historyPast.length>0||(this._historyPast.push(t),this._historyPast.length>100&&this._historyPast.shift()),this._historyCurrent=s,this._historyFuture=[],this._lastHistoryKind=e,this._lastHistoryAt=i,this._announceHistory()}_reconcileCurrentHistory(){this._historyCurrent&&(this._historyCurrent=this._snapshot())}async _travelHistory(e){let s=e==="undo"?this._historyPast:this._historyFuture,t=e==="undo"?this._historyFuture:this._historyPast;if(!s.length)return!1;clearTimeout(this._sourceTimer);let i=s.pop();return t.push(this._historyCurrent||this._snapshot()),this._values=p(i.values),this._disabledIds=new Set(i.disabledIds||[]),this._setSourceText(i.source),this._historyCurrent=this._snapshot(),this._lastHistoryKind=null,this._lastHistoryAt=0,this._refreshGrid(),this._activeKey&&this._highlightKey(this._activeKey),this.explicitSave||(this._applyAll(e),await this._persist(e)),this._announceHistory(),this._setStatus(e==="undo"?"\u5DF2\u64A4\u9500 \xB7 \u5F85\u4FDD\u5B58":"\u5DF2\u91CD\u505A \xB7 \u5F85\u4FDD\u5B58"),!0}undo(){return this._travelHistory("undo")}redo(){return this._travelHistory("redo")}refresh(){this._gridApi?.sizeColumnsToFit(),this._codeSurface?.refresh?.()}setLinkEnabled(e){this._linkEnabled=!!e,e||this._highlightKey(null)}get version(){return m}get latestVersion(){return this._latestVersion}get appId(){return this.getAttribute("app-id")||location.hostname||"app"}get schemaUrl(){return this.getAttribute("schema-url")}get valuesUrl(){return this.getAttribute("values-url")}get saveUrl(){return this.getAttribute("save-url")}get storageMode(){let e=this.getAttribute("storage");return e||(this.saveUrl?"remote":"local")}get storageKey(){return this.getAttribute("storage-key")||`laity.settings.${this.appId}.v1`}_render(){let e=[...this.children].filter(t=>t.hasAttribute("data-laity-footer"));this.innerHTML=`
      <section class="las-shell ${this.getAttribute("layout")==="horizontal"?"las-split":""}">
        <div class="las-grid-col">
        <header class="las-head">
          <div class="las-title-wrap">
            <p class="las-kicker">Shared Settings \xB7 v${m}</p>
            <h2 class="las-title">${this.getAttribute("title")||"\u8BBE\u7F6E"}</h2>
          </div>
          <div class="las-toolbar">
            <span class="las-update" data-role="update" hidden>
              <span data-role="update-message"></span>
              <button type="button" data-role="upgrade">\u5237\u65B0\u5347\u7EA7</button>
            </span>
            <button type="button" data-role="undo" disabled title="\u64A4\u9500\u8BBE\u7F6E\u4FEE\u6539\uFF08\u2318/Ctrl+Z\uFF09">\u64A4\u9500</button>
            <button type="button" data-role="redo" disabled title="\u91CD\u505A\u8BBE\u7F6E\u4FEE\u6539\uFF08\u2318/Ctrl+Shift+Z\uFF09">\u91CD\u505A</button>
            <button type="button" data-role="reload">\u91CD\u65B0\u8F7D\u5165</button>
            <button type="button" data-role="reset">\u6062\u590D\u9ED8\u8BA4</button>
            <span class="las-status" data-role="status" role="status" aria-live="polite"></span>
          </div>
        </header>
        <div class="las-grid" data-role="grid" aria-label="\u5E94\u7528\u8BBE\u7F6E\u8868"></div>
        <div class="las-app-footer" data-role="footer"></div>
        </div>
        <div class="las-divider" data-role="divider" role="separator" tabindex="0" aria-label="\u8C03\u6574\u8BBE\u7F6E AG \u8868\u4E0E\u6E90\u7801\u7684\u5206\u9694" aria-valuemin="25" aria-valuemax="70" aria-valuenow="43"></div>
        <div class="las-source-col">
        <div class="las-source-head">
          <div>
            <h3 class="las-source-title">\u6E90\u7801</h3>
            <p class="las-source-note">\u8868\u683C\u6539\u52A8\u4F1A\u7ACB\u5373\u540C\u6B65\u5230\u8FD9\u91CC\uFF1B\u590D\u6742\u53C2\u6570\u548C\u5141\u8BB8\u81EA\u5B9A\u4E49\u7684\u5019\u9009\u5916\u503C\u53EF\u76F4\u63A5\u5728\u8FD9\u91CC\u4FEE\u6539\u3002\u5408\u6CD5\u6E90\u7801\u4F1A\u5B9E\u65F6\u9884\u89C8\uFF0C\u4FDD\u5B58\u540E\u6301\u4E45\u5316\u3002</p>
          </div>
          <div class="las-source-actions">
            <button type="button" data-role="format">\u683C\u5F0F\u5316</button>
            <button type="button" data-role="save-source">\u4FDD\u5B58\u6E90\u7801</button>
          </div>
        </div>
        <textarea class="las-source" data-role="source" spellcheck="false" aria-label="\u8BBE\u7F6E\u6E90\u7801"></textarea>
        <div class="las-code-host" data-role="code-host" aria-label="\u8BBE\u7F6E CodeMirror \u6E90\u7801"></div>
        <div class="las-preview-divider" data-role="preview-divider" role="separator"
          tabindex="0" aria-orientation="horizontal" aria-label="\u8C03\u6574\u6E90\u7801\u4E0E\u503C\u9884\u89C8\u9AD8\u5EA6"
          aria-valuemin="15" aria-valuemax="65" aria-valuenow="30"></div>
        <section class="las-preview" data-role="preview" aria-label="${this.getAttribute("table-layout")==="components"?"\u503C\u9884\u89C8":"\u53C2\u6570\u9884\u89C8"}" data-preview-key="">
          <div class="las-preview-title">${this.getAttribute("table-layout")==="components"?"\u503C\u9884\u89C8":"\u53C2\u6570\u9884\u89C8"}</div><p class="las-preview-note">\u9009\u62E9 AG \u884C\u6216\u6E90\u7801\u914D\u7F6E\u9879\u4EE5\u67E5\u770B\u53C2\u6570\u3002</p>
        </section>
        </div>
      </section>
    `;for(let t of e)this.querySelector('[data-role="footer"]').append(t);this._els=Object.fromEntries([...this.querySelectorAll("[data-role]")].map(t=>[t.dataset.role,t])),this._els.undo.addEventListener("click",()=>void this.undo()),this._els.redo.addEventListener("click",()=>void this.redo()),this.addEventListener("keydown",t=>{if(!(t.metaKey||t.ctrlKey)||t.altKey)return;let i=t.key.toLowerCase();if(i!=="z"&&i!=="y")return;let r=i==="y"||t.shiftKey;(r?!this.canRedo:!this.canUndo)||(t.preventDefault(),t.stopPropagation(),r?this.redo():this.undo())},{capture:!0}),this._els.upgrade.addEventListener("click",()=>this._reloadForUpgrade()),this._els.reload.addEventListener("click",()=>void this.reload()),this._els.reset.addEventListener("click",()=>void this.reset()),this._els.format.addEventListener("click",()=>{try{let t=w(this._els.source.value,this._schema);this._setSourceText(I(t.values,this._schema,{comments:this.sourceComments,disabled:t.disabled})),this._recordEdit("format"),this._setStatus("\u6E90\u7801\u5DF2\u683C\u5F0F\u5316 \xB7 \u672A\u4FDD\u5B58")}catch(t){this._setStatus("\u6E90\u7801 JSON \u65E0\u6CD5\u89E3\u6790\uFF1A"+t.message,"error")}}),this._els["save-source"].addEventListener("click",()=>void this._saveSource()),this._els.source.addEventListener("input",()=>{this._recordEdit("source"),this._queueSourcePreview()});let s=()=>this._onSourceCaret(this._els.source.selectionStart);for(let t of["click","keyup","select"])this._els.source.addEventListener(t,s);this._installDivider(),this._installPreviewDivider()}_installPreviewDivider(){if(this.getAttribute("layout")!=="horizontal")return;let e=this._els["preview-divider"],s=r=>{let n=Math.min(65,Math.max(15,r));this.style.setProperty("--las-preview-height",n+"%"),e.setAttribute("aria-valuenow",String(Math.round(n))),this._codeSurface?.refresh?.()},t="laity-settings-preview-height:"+this.appId;try{let r=Number(localStorage.getItem(t));r>=15&&r<=65&&s(r)}catch{}let i=()=>{try{localStorage.setItem(t,e.getAttribute("aria-valuenow"))}catch{}};e.addEventListener("keydown",r=>{["ArrowUp","ArrowDown"].includes(r.key)&&(r.preventDefault(),s((Number(e.getAttribute("aria-valuenow"))||30)+(r.key==="ArrowUp"?2:-2)),i())}),e.addEventListener("pointerdown",r=>{if(r.button!==0)return;r.preventDefault(),e.setPointerCapture(r.pointerId);let n=o=>{let l=this.querySelector(".las-source-col").getBoundingClientRect();s((l.bottom-o.clientY)/l.height*100)},d=()=>{e.removeEventListener("pointermove",n),i()};e.addEventListener("pointermove",n),e.addEventListener("pointerup",d,{once:!0}),e.addEventListener("pointercancel",d,{once:!0})})}_installDivider(){let e=this._els.divider;if(this.getAttribute("layout")!=="horizontal")return;let s=n=>{let l=Math.min(70,Math.max(25,n));this.style.setProperty("--las-left-width",`${l}%`),e.setAttribute("aria-valuenow",String(Math.round(l))),this._gridApi?.sizeColumnsToFit()},t="laity-settings-width:"+this.appId,i=Number(localStorage.getItem(t));i>=25&&i<=70&&s(i);let r=()=>localStorage.setItem(t,e.getAttribute("aria-valuenow"));e.addEventListener("keydown",n=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(n.key))return;n.preventDefault();let d=Number(e.getAttribute("aria-valuenow"))||43;s(d+(n.key==="ArrowRight"||n.key==="ArrowDown"?2:-2)),r()}),e.addEventListener("pointerdown",n=>{if(n.button!==0)return;n.preventDefault(),e.setPointerCapture(n.pointerId);let d=this.querySelector(".las-shell"),o=u=>{let c=d.getBoundingClientRect(),g=window.matchMedia("(max-width:760px)").matches,f=g?(u.clientY-c.top)/c.height:(u.clientX-c.left)/c.width;g?this.style.setProperty("--las-mobile-top",`${Math.round(Math.max(.25,Math.min(.7,f))*100)}%`):s(f*100)},l=()=>{e.removeEventListener("pointermove",o),r()};e.addEventListener("pointermove",o),e.addEventListener("pointerup",l,{once:!0}),e.addEventListener("pointercancel",l,{once:!0})})}async _mountSourceSurface(){if(this.getAttribute("source-editor")==="codemirror")try{await import(this.getAttribute("source-module-url")||le);let s=document.createElement("laity-source-surface");s.setAttribute("editable","true"),s.setAttribute("line-numbers","true"),s.setAttribute("syntax","jsonc"),s.setAttribute("wrap","true"),s.setAttribute("scroll-container","true"),s.setAttribute("aria-label","\u8BBE\u7F6E\u6E90\u7801"),this._els["code-host"].replaceChildren(s),this._codeSurface=s,s.addEventListener("laity-source-change",t=>{this._updatingSource||(this._els.source.value=t.detail.value,this._recordEdit("source"),this._queueSourcePreview())}),s.addEventListener("laity-source-selection",t=>{this._els.source.value!==s.value&&(this._els.source.value=s.value),this._onSourceCaret(t.detail.head)}),this._els.source.value&&(s.value=this._els.source.value),this.dataset.sourceReady="true"}catch(e){this.setAttribute("source-editor","textarea"),this.dataset.sourceReady="fallback",this._setStatus("\u5171\u4EAB CodeMirror \u672A\u52A0\u8F7D\uFF0C\u5DF2\u4F7F\u7528\u6807\u51C6\u6587\u672C\u6E90\u7801\uFF1A"+e.message,"error")}}_setSourceText(e){if(this._els.source.value=e,this._codeSurface&&this._codeSurface.value!==e){this._updatingSource=!0;try{this._codeSurface.value=e}finally{this._updatingSource=!1}}}_sourceAnchor(e){return[...N(this._els.source.value),...O(this._els.source.value)].find(s=>s.key===e)}_highlightKey(e,{scroll:s=!1,focus:t=!1}={}){if(this._linkEnabled===!1)return;this._activeKey=e;let i=e?this._sourceAnchor(e):void 0;if(this._gridApi){if(s&&e){let r=this._gridApi.getRowNode(e);r?.rowIndex==null&&this._gridApi.isAnyFilterPresent()&&this._gridApi.setFilterModel(null),r=this._gridApi.getRowNode(e),r?.rowIndex!=null&&this._gridApi.ensureIndexVisible(r.rowIndex,"middle")}this._gridApi.redrawRows()}this._codeSurface?(this._codeSurface.ranges=i?[{from:i.from,to:i.to,role:"group"}]:[],i&&t&&this._codeSurface.revealRange(i.from,i.to,{focus:!0})):i&&t&&(this._els.source.focus(),this._els.source.setSelectionRange(i.from,i.to)),this.dataset.linkedKey=e||"",this._renderPreview()}_onSourceCaret(e){if(this._linkEnabled===!1)return;let t=O(this._els.source.value).find(i=>e>=i.from&&e<=i.end)?.key||K(this._els.source.value,e);t!==this._activeKey&&this._highlightKey(t,{scroll:!0})}selectSetting(e){this._highlightKey(e,{scroll:!0,focus:!0})}_renderPreview(){let e=this._els?.preview;if(!e)return;e.replaceChildren();let s=this._schema.find(o=>o.id===this._activeKey);e.dataset.previewKey=s?.id||"";let t=(o,l,u)=>{let c=document.createElement(o);return l&&(c.className=l),u!=null&&(c.textContent=String(u)),c};if(!s){e.append(t("span","las-preview-title",this.getAttribute("table-layout")==="components"?"\u503C\u9884\u89C8":"\u53C2\u6570\u9884\u89C8"),t("span","las-preview-note","\u9009\u62E9 AG \u884C\u6216\u6E90\u7801\u914D\u7F6E\u9879\u4EE5\u67E5\u770B\u53C2\u6570\u3002"));return}let i=this._values[s.id],r=t("div","las-preview-header");r.append(t("strong","las-preview-title",s.label),t("code","las-preview-key",s.id)),e.append(r);let n=s.description||"\u6B64\u53C2\u6570\u672A\u63D0\u4F9B\u8BF4\u660E\u3002";e.append(t("div","las-preview-note",n));let d=this.getAttribute("table-layout")==="components";if(d){let o=h=>h&&typeof h=="object"?JSON.stringify(h,null,2):JSON.stringify(h),l=t("dl","las-preview-facts"),u=(h,y,b,T=!1)=>{let ie=t("dt","",h),C=t("dd","");b&&(C.dataset.previewField=b),C.append(t(T?"pre":"span",T?"las-preview-value":"",y)),l.append(ie,C)};u("\u7EC4\u4EF6\u6A21\u5757",s.component,"component"),u("\u529F\u80FD\u7EC4",s.featureGroup,"feature-group"),u("\u53C2\u6570\u540D",s.label,"parameter-name"),u("\u53C2\u6570 ID",s.id,"parameter-id"),u("\u542F\u7528\u72B6\u6001",this._disabledIds.has(s.id)?"\u5DF2\u7981\u7528 \xB7 \u6E90\u7801\u4FDD\u7559\u4E3A\u6CE8\u91CA":"\u5DF2\u542F\u7528","enabled-state"),u("\u7C7B\u578B",x(s),"type"),u("\u5F53\u524D\u503C",o(i),"current-value",!0),u("\u9ED8\u8BA4\u503C",o(s.defaultValue),"default-value",!0),u("\u7F16\u8F91\u6743\u9650",s.readOnly?"\u53EA\u8BFB":"\u53EF\u7F16\u8F91","permission");let c={};for(let h of["required","min","max","pattern","options","allowCustomValue"])s[h]!==void 0&&(c[h]=s[h]);u("\u7EA6\u675F",Object.keys(c).length?JSON.stringify(c,null,2):"\u65E0","constraints",!0),e.append(l);let g=t("details","las-preview-definition");g.append(t("summary","","\u5B8C\u6574\u53C2\u6570\u5B9A\u4E49"));let f=t("pre","las-preview-value",JSON.stringify(s,null,2));f.dataset.previewField="definition",g.append(f),e.append(g)}if($(s,i)){let o=t("div","las-preview-current"),l=t("div","las-preview-swatch");l.style.background=String(i),l.setAttribute("aria-label","\u5F53\u524D\u989C\u8272\u9884\u89C8"),o.append(l,t("code","",String(i))),e.append(o);let u=t("span","las-preview-key","\u63A8\u8350\u989C\u8272 \xB7 \u70B9\u51FB\u4EE5\u66F4\u65B0\u53C2\u6570\u8349\u7A3F");e.append(u);let c=U(s,i),g=t("div","las-preview-options");for(let f=0;f<3;f++){let h=c[f],y=t("button","las-preview-choice");y.type="button",y.dataset.previewColorSlot=String(f+1),y.disabled=s.readOnly||!h,y.setAttribute("aria-label",h?`\u63A8\u8350\u989C\u8272 ${f+1}\uFF1A${h}`:`\u63A8\u8350\u989C\u8272 ${f+1} \u65E0\u53EF\u7528\u5019\u9009`),y.setAttribute("aria-pressed",String(h===i));let b=t("i","");h&&(b.style.background=h),y.append(b,t("span","",h||"\u65E0\u5019\u9009")),h&&y.addEventListener("click",()=>void this._commitGridValue(s,h)),g.append(y)}e.append(g)}else if(x(s)==="boolean"){let o=t("div","las-preview-bool");o.setAttribute("role","group"),o.setAttribute("aria-label",`${s.label} \xB7 \u4E8C\u9009\u4E00`);for(let l of[!0,!1]){let u=t("button","",l?"\u5F00\u542F \xB7 true":"\u5173\u95ED \xB7 false");u.type="button",u.dataset.previewBoolean=String(l),u.setAttribute("aria-pressed",String(i===l)),u.disabled=s.readOnly,u.addEventListener("click",()=>void this._commitGridValue(s,l)),o.append(u)}e.append(o)}else{if(!d){let o=i&&typeof i=="object"?JSON.stringify(i):String(i??"");e.append(t("div","las-preview-current",o.length>350?o.slice(0,347)+"\u2026":o))}z(s)&&e.append(t("p","las-preview-note","\u590D\u6742\u503C\u8BF7\u5728\u4E0A\u65B9\u6E90\u7801\u7A97\u4FEE\u6539\u3002"))}}_setBusy(e){for(let s of["reload","reset","save-source"])this._els[s].disabled=e}_setStatus(e,s=""){this._els.status.textContent=e,this._els.status.dataset.kind=s}_startUpdateWatch(){document.addEventListener("visibilitychange",this._onVisibilityChange),this._checkForUpdate(),this._updateTimer=window.setInterval(()=>void this._checkForUpdate(),de)}async _checkForUpdate(){try{let e=await fetch(F,{cache:"no-store",credentials:"omit",mode:"cors"});if(!e.ok)return;let s=await e.json(),t=String(s?.version??"").trim();if(!t)return;this._latestVersion=t,this.dataset.latestVersion=t;let i=ue(t,m)>0;if(this._els.update.hidden=!i,!i)return;this._els["update-message"].textContent=`\u53D1\u73B0 Shared Settings v${t}\uFF08\u5F53\u524D v${m}\uFF09`,this.dispatchEvent(new CustomEvent("laity-settings-update-available",{bubbles:!0,composed:!0,detail:{appId:this.appId,currentVersion:m,latestVersion:t,manifestUrl:F}}))}catch{}}_reloadForUpgrade(){let e=new URL(location.href);e.searchParams.set("__settings_v",this._latestVersion||Date.now().toString()),location.replace(e.href)}_localRead(){if(this.storageMode!=="local")return null;try{let e=localStorage.getItem(this.storageKey);return e?JSON.parse(e):null}catch{return null}}_localWrite(e){this.storageMode==="local"&&localStorage.setItem(this.storageKey,JSON.stringify(e))}_localClear(){this.storageMode==="local"&&localStorage.removeItem(this.storageKey)}_readDisabled(){try{let e=JSON.parse(localStorage.getItem(this.storageKey+".disabled.v1")||"[]"),s=new Set(this._schema.map(t=>t.id));return new Set(Array.isArray(e)?e.filter(t=>s.has(t)):[])}catch{return new Set}}_writeDisabled(){try{localStorage.setItem(this.storageKey+".disabled.v1",JSON.stringify([...this._disabledIds]))}catch{}}async setSettingEnabled(e,s){if(!this._schema.some(t=>t.id===e))throw new Error("\u672A\u77E5\u53C2\u6570\uFF1A"+e);return this._disabledIds.has(e)===!s?!1:(s?this._disabledIds.delete(e):this._disabledIds.add(e),this.explicitSave||this._applyAll("enabled-change",[e]),this._syncSource(),this._refreshGrid(),this._recordEdit("enabled"),this._highlightKey(e),this.explicitSave?this._setStatus("\u542F\u7528\u72B6\u6001\u5DF2\u4FEE\u6539 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("enabled-change"),!0)}async reload(){if(!this._loading){if(!this.schemaUrl&&!this.settingsSchema){this._setStatus("\u7F3A\u5C11 schema-url","error");return}this._loading=!0,this.dataset.ready="loading",this._setBusy(!0),this._setStatus("\u6B63\u5728\u8F7D\u5165\u2026");try{this._schema=pe(this.settingsSchema||await W(this.schemaUrl));let e=q(this._schema);if(this.valuesUrl){let i=await W(this.valuesUrl),r=i?.values&&typeof i.values=="object"?i.values:i;e={...e,...r}}this.initialValues&&(e={...e,...p(this.initialValues)});let s=this._localRead();s&&(e={...e,...s});let t=E(this._schema,e);if(t.errors.length)throw new Error(t.errors.join("\uFF1B"));this._values=t.values,this._disabledIds=this._readDisabled(),this._applyAll("reload"),await this._ensureGrid(),this._refreshGrid(),this._syncSource(),this._resetHistory(),!this._activeKey&&this._schema[0]&&this._highlightKey(this._schema[0].id),this.dataset.ready="true",this._setStatus(`\u5DF2\u8F7D\u5165 \xB7 ${this._schema.length} \u9879`,"ok"),this.dispatchEvent(new CustomEvent("laity-settings-ready",{bubbles:!0,composed:!0,detail:{appId:this.appId,version:m,settingCount:this._schema.length}}))}catch(e){this.dataset.ready="error",this._setStatus("\u8F7D\u5165\u5931\u8D25\uFF1A"+(e?.message??String(e)),"error"),this.dispatchEvent(new CustomEvent("laity-settings-load-error",{bubbles:!0,composed:!0,detail:{appId:this.appId,version:m,message:e?.message??String(e)}}))}finally{this._loading=!1,this._setBusy(!1)}}}_rows(){let e=this._schema.map(t=>{let i=k(t),r=this._values[t.id];return{id:t.id,enabled:!this._disabledIds.has(t.id),theme:t.theme,category:t.category,group:t.group,componentModule:t.component,featureGroup:t.featureGroup,parameterName:t.label,value:z(t)?JSON.stringify(r):String(r??""),description:t.description,optionValues:i.map(n=>String(n.value)),options:i,allowCustomValue:!!t.allowCustomValue,colorOptions:X(t),complex:z(t),readOnly:t.readOnly,setting:t}}),s=new Set(e.map(t=>t.componentModule));for(let t of this._componentCatalog)s.has(t.name)||e.push({id:"component:"+t.id,componentId:t.id,componentModule:t.name,componentPlaceholder:!0,enabled:null,theme:"",category:"",group:"",featureGroup:"",parameterName:"",value:"",description:"",readOnly:!0});return e}async _ensureGrid(){if(this._gridApi)return;let{createGrid:e,gridTheme:s}=await Z();this._gridApi||!this.isConnected||(this._gridApi=e(this._els.grid,{theme:s,rowData:[],columnDefs:this.getAttribute("table-layout")==="components"?[this._enabledColumn(),{field:"componentModule",headerName:"\u7EC4\u4EF6\u6A21\u5757",flex:1,minWidth:112,pinned:"left",filter:v,suppressHeaderMenuButton:!0},{field:"featureGroup",headerName:"\u529F\u80FD\u7EC4",flex:1,minWidth:96,filter:v,suppressHeaderMenuButton:!0},{field:"parameterName",headerName:"\u53C2\u6570\u540D",valueGetter:t=>t.data?.componentPlaceholder?"":this._parameterNameMode==="id"?t.data?.id:t.data?.parameterName,filterValueGetter:t=>t.data?.componentPlaceholder?"":this._parameterNameMode==="id"?t.data?.id:t.data?.parameterName,flex:1.2,minWidth:106,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0}]:[this._enabledColumn(),{field:"theme",headerName:"\u4E3B\u9898",width:110,minWidth:96,pinned:"left",filter:v,suppressHeaderMenuButton:!0},{field:"category",headerName:"\u5206\u7C7B",width:120,minWidth:100,filter:v,suppressHeaderMenuButton:!0},{field:"group",headerName:"\u5206\u7EC4",width:120,minWidth:100,filter:v,suppressHeaderMenuButton:!0},{field:"parameterName",headerName:"\u53C2\u6570\u540D",width:180,minWidth:150,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0},{field:"value",headerName:"\u53C2\u6570\u503C",width:230,minWidth:150,flex:1,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0,filterValueGetter:t=>{let i=t.data;return i?i.complex?String(i.value??""):i.options?.find(n=>String(n.value)===String(i.value))?.label??String(i.value??""):""},editable:t=>!t.data?.readOnly&&!t.data?.complex,singleClickEdit:!0,cellEditorSelector:t=>{let i=t.data;if(!(!i||i.readOnly||i.complex))return i.allowCustomValue?{component:L,popup:!0,popupPosition:"under",params:{options:i.options,colorOptions:i.colorOptions}}:i.optionValues?.length?i.colorOptions?{component:V,popup:!0,popupPosition:"under",params:{options:i.options}}:{component:"agSelectCellEditor",params:{values:i.optionValues}}:{component:"agTextCellEditor"}},cellRenderer:t=>{let i=t.data;if(!i)return String(t.value??"");if(i.colorOptions&&!i.complex){let n=i.options?.find(d=>String(d.value)===String(t.value));return M(n?.label??t.value,t.value)}if(i.complex){let n=String(t.value??"");return n.length>44?n.slice(0,41)+"\u2026":n}return i.options?.find(n=>String(n.value)===String(t.value))?.label??String(t.value??"")},valueFormatter:t=>{let i=t.data;if(!i)return String(t.value??"");if(i.complex){let n=String(t.value??"");return n.length>44?n.slice(0,41)+"\u2026":n}return i.options?.find(n=>String(n.value)===String(t.value))?.label??String(t.value??"")}}],defaultColDef:{sortable:!0,resizable:!0,suppressMovable:!0},suppressColumnVirtualisation:!0,suppressMovableColumns:!0,animateRows:!1,rowHeight:40,getRowHeight:()=>40,headerHeight:38,getRowId:t=>t.data.id,getRowClass:t=>[t.data?.id===this._activeKey?"las-linked-row":null,t.data?.componentPlaceholder?"las-component-placeholder":null,t.data?.enabled===!1?"las-setting-disabled":null].filter(Boolean).join(" "),stopEditingWhenCellsLoseFocus:!0,onRowClicked:t=>{!t.data||t.data.componentPlaceholder||(this._highlightKey(t.data.id,{focus:!0}),t.data.complex&&this._setStatus(`${t.data.parameterName}\uFF1A\u590D\u6742\u53C2\u6570\u8BF7\u5728\u6E90\u7801\u533A\u4FEE\u6539`))},onCellValueChanged:t=>{t.colDef.field!=="value"||!t.data||t.data.componentPlaceholder||t.newValue!==t.oldValue&&this._commitGridValue(t.data.setting,t.newValue)}}))}_enabledColumn(){return{field:"enabled",headerName:"\u542F\u7528",width:66,minWidth:66,maxWidth:78,pinned:"left",sortable:!1,filter:!1,resizable:!1,suppressHeaderMenuButton:!0,cellRenderer:e=>{if(e.data?.componentPlaceholder){let i=document.createElement("span");return i.dataset.componentPlaceholder="true",i}let s=document.createElement("label");s.className="las-enabled-toggle";let t=document.createElement("input");return t.type="checkbox",t.checked=!!e.data?.enabled,t.dataset.settingEnabled=e.data?.id||"",t.setAttribute("aria-label","\u542F\u7528 "+(e.data?.parameterName||"\u53C2\u6570")),t.addEventListener("click",i=>i.stopPropagation()),t.addEventListener("change",i=>{i.stopPropagation(),this.setSettingEnabled(e.data.id,t.checked)}),s.append(t),s}}}_refreshGrid(){this._gridApi&&(this._gridApi.setGridOption("rowData",this._rows()),this._gridApi.refreshCells({force:!0}),this._activeKey&&this._gridApi.redrawRows(),this._renderPreview())}_syncSource(){this._setSourceText(I(this._values,this._schema,{comments:this.sourceComments,disabled:this._disabledIds})),this._activeKey&&this._highlightKey(this._activeKey)}_applyAll(e,s=this._schema.map(t=>t.id)){for(let t of this._schema){if(this._disabledIds.has(t.id)){t.target?.type==="css-var"&&document.documentElement.style.removeProperty(t.target.key);continue}let i=this._values[t.id];t.target?.type==="css-var"&&document.documentElement.style.setProperty(t.target.key,String(i))}this.dispatchEvent(new CustomEvent("laity-settings-change",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,changedIds:[...s],values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}))}async _commitGridValue(e,s){let t=p(this._values);try{let i=ee(e,s),r=te(e,i);if(r)throw new Error(r);this._values={...this._values,[e.id]:i},typeof this.validateValues=="function"&&this.validateValues(this._values),this.explicitSave||this._applyAll("grid",[e.id]),this._syncSource(),this._refreshGrid(),this._recordEdit("grid"),this._highlightKey(e.id),this.explicitSave?this._setStatus("\u8868\u683C\u5DF2\u4FEE\u6539 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("grid")}catch(i){this._values=t,this._applyAll("revert",[e.id]),this._syncSource(),this._refreshGrid(),this._setStatus(`${e.label}\uFF1A${i?.message??i}`,"error")}}_queueSourcePreview(){clearTimeout(this._sourceTimer),this._sourceTimer=setTimeout(()=>{try{let e=w(this._els.source.value,this._schema),s=E(this._schema,e.values,{strictUnknown:!0,currentValues:this._values});if(s.errors.length)throw new Error(s.errors.join("\uFF1B"));typeof this.validateValues=="function"&&this.validateValues(s.values);let t=this._schema.filter(i=>!A(this._values[i.id],s.values[i.id])||this._disabledIds.has(i.id)!==e.disabled.has(i.id)).map(i=>i.id);this._values=s.values,this._disabledIds=e.disabled,this._reconcileCurrentHistory(),this.explicitSave||this._applyAll("source-preview",t),this._refreshGrid(),this._setStatus("\u6E90\u7801\u5B9E\u65F6\u9884\u89C8 \xB7 \u672A\u4FDD\u5B58")}catch(e){this._setStatus("\u6E90\u7801\u672A\u5E94\u7528\uFF1A"+(e?.message??String(e)),"error")}},180)}async _saveSource(){clearTimeout(this._sourceTimer);try{let e=w(this._els.source.value,this._schema),s=E(this._schema,e.values,{strictUnknown:!0,currentValues:this._values});if(s.errors.length)throw new Error(s.errors.join("\uFF1B"));typeof this.validateValues=="function"&&this.validateValues(s.values);let t=this._schema.filter(i=>!A(this._values[i.id],s.values[i.id])||this._disabledIds.has(i.id)!==e.disabled.has(i.id)).map(i=>i.id);this._values=s.values,this._disabledIds=e.disabled,this._applyAll("source-save",t),this._refreshGrid(),this._syncSource(),this._reconcileCurrentHistory(),await this._persist("source")}catch(e){this._setStatus("\u6E90\u7801\u4FDD\u5B58\u5931\u8D25\uFF1A"+(e?.message??String(e)),"error")}}async _persist(e){if(this.storageMode==="none"){this._writeDisabled(),this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u7531\u5E94\u7528\u63A5\u7BA1\u6301\u4E45\u5316","ok"),this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}));return}if(this.storageMode==="local"){this._localWrite(this._values),this._writeDisabled(),this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u672C\u673A\u6D4F\u89C8\u5668","ok"),this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}));return}if(!this.saveUrl)throw new Error("remote storage \u7F3A\u5C11 save-url");let s=++this._saveInFlight;this._setStatus("\u6B63\u5728\u4FDD\u5B58\u2026");let t=await fetch(this.saveUrl,{method:this.getAttribute("save-method")||"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({appId:this.appId,reason:e,values:this._values,disabledIds:[...this._disabledIds],clientVersion:m})});if(!t.ok)throw new Error(`${t.status} ${t.statusText}`);if(s===this._saveInFlight){if(this._writeDisabled(),(t.headers.get("content-type")||"").includes("application/json")){let r=await t.json();if(r?.values){let n=E(this._schema,r.values);n.errors.length||(this._values=n.values,this._applyAll("server-canonical"),this._refreshGrid(),this._syncSource(),this._reconcileCurrentHistory())}}this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u8FD0\u884C\u65F6\u914D\u7F6E","ok")}this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}))}async reset(){let e=p(this._values),s=new Set(this._disabledIds);try{this._values=q(this._schema),this._disabledIds.clear(),this.explicitSave||this._localClear(),this.explicitSave||this._applyAll("reset"),this._refreshGrid(),this._syncSource(),this._recordEdit("reset"),this.explicitSave?this._setStatus("\u9ED8\u8BA4\u914D\u7F6E\u5DF2\u586B\u5165 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("reset")}catch(t){this._values=e,this._disabledIds=s,this._applyAll("revert"),this._refreshGrid(),this._syncSource(),this._setStatus("\u6062\u590D\u9ED8\u8BA4\u5931\u8D25\uFF1A"+(t?.message??String(t)),"error")}}};customElements.get("laity-settings-panel")||customElements.define("laity-settings-panel",P);export{P as LaitySettingsPanel,m as SHARED_SETTINGS_VERSION,E as normalizeCandidate,pe as normalizeSchema,Ae as preloadSettingsGrid};
