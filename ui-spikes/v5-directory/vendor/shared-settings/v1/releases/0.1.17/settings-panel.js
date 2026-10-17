function ie(a){let e="",i=!1,t=!1;for(let s=0;s<a.length;s++){let r=a[s],n=a[s+1];if(i){e+=r,t?t=!1:r==="\\"?t=!0:r==='"'&&(i=!1);continue}if(r==='"'){i=!0,e+=r;continue}if(r==="/"&&n==="/"){for(e+="  ",s+=2;s<a.length&&a[s]!==`
`&&a[s]!=="\r";)e+=" ",s++;s<a.length&&(e+=a[s]);continue}if(r==="/"&&n==="*"){e+="  ",s+=2;let d=!1;for(;s<a.length;s++){if(a[s]==="*"&&a[s+1]==="/"){e+="  ",s++,d=!0;break}e+=a[s]===`
`||a[s]==="\r"?a[s]:" "}if(!d)throw new SyntaxError("JSON \u6CE8\u91CA\u672A\u7ED3\u675F");continue}e+=r}return e}function T(a){return JSON.parse(ie(a))}function R(a,e,{comments:i=!0}={}){let t={};for(let n of e)t[n.id]=structuredClone(a[n.id]);let s=JSON.stringify(t,null,2);if(!i)return s;let r=new Map(e.map(n=>[n.id,n]));return s.split(`
`).map(n=>{let d=/^  ("(?:\\.|[^"\\])*"):\s/.exec(n);if(!d)return n;let l=r.get(JSON.parse(d[1]));if(!l)return n;let o=[l.label,l.description].filter(Boolean).join(" \u2014 ").replace(/[\r\n\u2028\u2029]+/g," ").trim();return o?`  // ${o}
${n}`:n}).join(`
`)}var ae=a=>{let e=String(a||"").trim(),i=/^#([0-9a-f]{3})$/i.exec(e);if(i)return i[1].split("").map(r=>parseInt(r+r,16));let t=/^#([0-9a-f]{6})$/i.exec(e);if(t)return[0,2,4].map(r=>parseInt(t[1].slice(r,r+2),16));let s=/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i.exec(e);if(s){let r=s.slice(1).map(Number);return r.every(n=>n<=255)?r:null}return null},D=a=>"#"+a.map(e=>Math.max(0,Math.min(255,Math.round(e))).toString(16).padStart(2,"0")).join(""),$=(a,e,i)=>D(a.map((t,s)=>t*(1-i)+e[s]*i));function K(a,e){return typeof e=="string"&&(a.cssProperty==="color"||a.target?.type==="css-var"&&a.cssProperty==="color"||/color|colour|颜色|色值/i.test(`${a.id} ${a.label}`)||typeof CSS<"u"&&CSS.supports?.("color",e)===!0&&/^(#|rgba?\(|hsla?\()/i.test(e))}function H(a,e){let i=(a.options??[]).map(d=>typeof d=="object"&&d!==null&&"value"in d?d.value:d).map(String).filter(d=>globalThis.CSS?.supports?.("color",d)),t=Array.isArray(a.recommendedColors)?a.recommendedColors.map(String):[];if(i.length&&!a.allowCustomValue){let d=[...t.filter(l=>i.includes(l)),...i.filter(l=>l!==String(e))];return Array.from({length:3},(l,o)=>d[o]||null)}let s=ae(e)||[131,154,181],r=[$(s,[255,255,255],.25),$(s,[0,0,0],.24),D(s.map(d=>255-d))],n=[...new Set([...t,...r].filter(d=>globalThis.CSS?.supports?.("color",d)))];return Array.from({length:3},(d,l)=>n[l]||null)}function I(a){let e=[],i=0,t=0,s=-1,r=!1,n=!1,d=a.length;for(let l=0;l<a.length;l++){let o=a[l],u=a[l+1];if(r){if(n){n=!1;continue}if(o==="\\"){n=!0;continue}if(o==='"'){if(r=!1,s>=0){let c=l+1;for(;c<a.length&&/\s/.test(a[c]);)c++;if(a[c]===":")try{e.push({key:JSON.parse(a.slice(s,l+1)),from:s,to:l+1,end:a.length})}catch{}}s=-1}continue}if(o==="/"&&u==="/"){for(l+=2;l<a.length&&a[l]!==`
`&&a[l]!=="\r";)l++;continue}if(o==="/"&&u==="*"){for(l+=2;l<a.length;l++)if(a[l]==="*"&&a[l+1]==="/"){l++;break}continue}o==='"'?(r=!0,s=i===1&&t===0?l:-1):o==="{"?i++:o==="}"?(i===1&&t===0&&(d=l),i=Math.max(0,i-1)):o==="["?t++:o==="]"&&(t=Math.max(0,t-1))}return e.forEach((l,o)=>l.end=e[o+1]?.from??d),e}function U(a,e){let i=I(a),t=a.lastIndexOf(`
`,Math.max(0,e-1))+1,s=a.indexOf(`
`,t),r=a.slice(t,s<0?a.length:s);if(/^\s*\/\//.test(r)){let n=i.find(d=>d.from>=e);if(n)return n.key}for(let n=i.length-1;n>=0;n--)if(e>=i[n].from&&e<i[n].end)return i[n].key;return null}var re=/^\s*\/\/ @disabled (".*")\s*$/,ne=/^\s*\/\/ @enddisabled (".*")\s*$/,le=/^\s*\/\/\| (.*)$/;function w(a,e){let i=T(a);if(!i||Array.isArray(i)||typeof i!="object")throw new SyntaxError("\u8BBE\u7F6E\u6E90\u7801\u5FC5\u987B\u662F JSON \u5BF9\u8C61");let t=new Set(e.map(d=>d.id)),s=new Set,r={},n=a.split(/\r?\n/);for(let d=0;d<n.length;d++){let l=re.exec(n[d]);if(!l)continue;let o=JSON.parse(l[1]);if(typeof o!="string"||!t.has(o))throw new SyntaxError("\u6CE8\u91CA\u4E2D\u5B58\u5728\u672A\u77E5\u53C2\u6570\uFF1A"+String(o));if(s.has(o)||Object.prototype.hasOwnProperty.call(i,o))throw new SyntaxError("\u53C2\u6570\u91CD\u590D\u58F0\u660E\uFF1A"+o);let u=[],c=!1;for(;++d<n.length;){let f=ne.exec(n[d]);if(f){if(JSON.parse(f[1])!==o)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u7ED3\u675F\u6807\u8BB0\u4E0D\u5339\u914D\uFF1A"+o);c=!0;break}let h=le.exec(n[d]);if(!h)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF1A"+o);u.push(h[1])}if(!c)throw new SyntaxError("\u7981\u7528\u53C2\u6570\u6CE8\u91CA\u672A\u7ED3\u675F\uFF1A"+o);let g;try{g=JSON.parse(`{
`+u.join(`
`)+`
}`)}catch(f){throw new SyntaxError("\u7981\u7528\u53C2\u6570\u503C\u4E0D\u80FD\u89E3\u6790\uFF1A"+o+"\uFF1A"+f.message)}if(Object.keys(g).length!==1||!Object.prototype.hasOwnProperty.call(g,o))throw new SyntaxError("\u7981\u7528\u53C2\u6570\u7684\u952E\u503C\u4E0D\u5339\u914D\uFF1A"+o);r[o]=g[o],s.add(o)}return{values:{...i,...r},disabled:s}}function N(a,e,{comments:i=!0,disabled:t=new Set}={}){if(!t.size)return R(a,e,{comments:i});let r=e.filter(d=>!t.has(d.id)).map(d=>d.id),n=["{"];for(let d of e){let l=[d.label,d.description].filter(Boolean).join(" \u2014 ").replace(/[\r\n\u2028\u2029]+/g," ").trim();i&&l&&n.push("  // "+l);let o=JSON.stringify({[d.id]:a[d.id]},null,2).split(`
`).slice(1,-1);if(t.has(d.id))n.push("  // @disabled "+JSON.stringify(d.id)),n.push(...o.map(u=>"  //| "+u)),n.push("  // @enddisabled "+JSON.stringify(d.id));else{if(!(r.shift()===d.id))throw Error("\u8BBE\u7F6E\u987A\u5E8F\u5F02\u5E38");r.length&&(o[o.length-1]+=","),n.push(...o)}}return[...n,"}"].join(`
`)}function z(a){let e=[],i=/^\s*\/\/ @disabled (".*")\s*$/gm,t;for(;t=i.exec(a);)try{let s=JSON.parse(t[1]);if(typeof s!="string")continue;let r=t.index+t[0].indexOf("//"),n="// @enddisabled "+JSON.stringify(s),d=a.indexOf(n,t.index+t[0].length);if(d<0)continue;e.push({key:s,from:r,to:r+t[0].length,end:d+n.length,disabled:!0})}catch{}return e}var m="0.1.17",G="laity-shared-settings-v1-style",J="laity-sarasa-ui-font-v1",_=new URL(import.meta.url),F=new URL(_.pathname.includes("/releases/")?"../../manifest.json":"./manifest.json",_).href,Y=new URL("./settings-grid.js",_);Y.search=_.search;var oe="https://agent-link.laity.bid/shared-source/v1/source-surface.js?v=0.2.5",de=300*1e3,S=null;function Z(){return S||(S=import(Y.href).catch(a=>{throw S=null,a})),S}function Ae(){return Z().then(()=>{})}function B(a){return String(a??"").split(/[.+-]/).slice(0,3).map(e=>Number.parseInt(e,10)||0)}function ue(a,e){let i=B(a),t=B(e);for(let s=0;s<3;s++)if(i[s]!==t[s])return i[s]>t[s]?1:-1;return 0}function ce(){if(!document.getElementById(J)){let e=document.createElement("link");e.id=J,e.rel="stylesheet",e.href=new URL("./sarasa-ui.css",_).href,e.crossOrigin="anonymous",document.head.append(e)}if(document.getElementById(G))return;let a=document.createElement("style");a.id=G,a.textContent=`
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
    @media(max-width:760px){
      laity-settings-panel[layout="horizontal"] .las-shell{flex-direction:column;}
      laity-settings-panel[layout="horizontal"] .las-grid-col{flex:0 0 var(--las-mobile-top,34%);}
      laity-settings-panel[layout="horizontal"] .las-source-col{flex:1;min-height:180px;}
      laity-settings-panel[layout="horizontal"] .las-divider{cursor:row-resize;}
    }
  `,document.head.append(a)}function p(a){return a==null?a:structuredClone(a)}function he(a){if(Array.isArray(a))return a;if(a&&Array.isArray(a.settings))return a.settings;throw new Error("settings schema must be an array or {settings:[...]}")}function k(a){return(a.options??[]).map(e=>e&&typeof e=="object"&&!Array.isArray(e)&&"value"in e?{label:String(e.label??e.value),value:e.value}:{label:String(e),value:e})}function X(a){if(typeof a!="string")return!1;let e=a.trim();return e?globalThis.CSS?.supports?.("color",e)===!0:!1}function Q(a){let e=k(a);return e.length>0&&e.every(i=>X(String(i.value)))}function j(a,e,{showCode:i=!0}={}){let t=document.createElement("span");t.className="las-color-value";let s=document.createElement("span");s.className="las-color-swatch",s.style.background=String(e),s.setAttribute("aria-hidden","true");let r=document.createElement("span");if(r.className="las-color-value-label",r.textContent=String(a??e),t.append(s,r),i){let n=document.createElement("span");n.className="las-color-value-code",n.textContent=String(e),t.append(n)}return t}function x(a){if(a.type)return a.type;let e=a.defaultValue;return Array.isArray(e)||e&&typeof e=="object"?"json":typeof e=="boolean"?"boolean":typeof e=="number"?"number":"string"}function V(a){let e=x(a);return a.editor==="source"||a.editor==="textarea"||e==="json"||e==="object"||e==="array"}function A(a,e){return JSON.stringify(a)===JSON.stringify(e)}function ee(a,e){let i=k(a);if(i.length){let s=i.find(r=>String(r.value)===String(e));if(s)return p(s.value)}let t=x(a);if(t==="boolean"){if(e===!0||e==="true"||e===1||e==="1")return!0;if(e===!1||e==="false"||e===0||e==="0")return!1;throw new Error("\u9700\u8981\u5E03\u5C14\u503C true / false")}if(t==="number"||t==="integer"){let s=Number(e);if(!Number.isFinite(s))throw new Error("\u9700\u8981\u6570\u5B57");if(t==="integer"&&!Number.isInteger(s))throw new Error("\u9700\u8981\u6574\u6570");return s}if(t==="json"||t==="object"||t==="array"){let s=typeof e=="string"?JSON.parse(e):p(e);if(t==="object"&&(!s||Array.isArray(s)||typeof s!="object"))throw new Error("\u9700\u8981 JSON \u5BF9\u8C61");if(t==="array"&&!Array.isArray(s))throw new Error("\u9700\u8981 JSON \u6570\u7EC4");return s}return String(e??"")}function te(a,e){if(a.required&&(e===""||e==null))return"\u4E0D\u80FD\u4E3A\u7A7A";let i=k(a),t=i.some(r=>A(r.value,e));if(i.length&&!t&&!a.allowCustomValue)return"\u4E0D\u5728\u5141\u8BB8\u9009\u9879\u4E2D";let s=x(a);if(s==="string"){if(typeof e!="string")return"\u9700\u8981\u5B57\u7B26\u4E32";if(a.pattern)try{if(!new RegExp(a.pattern).test(e))return"\u4E0D\u7B26\u5408\u683C\u5F0F\u8981\u6C42"}catch{return"schema pattern \u65E0\u6548"}}if((s==="number"||s==="integer")&&typeof e=="number"){if(a.min!=null&&e<a.min)return`\u4E0D\u80FD\u5C0F\u4E8E ${a.min}`;if(a.max!=null&&e>a.max)return`\u4E0D\u80FD\u5927\u4E8E ${a.max}`}if(a.target?.type==="css-var"){if(!/^--[a-z0-9_-]+$/i.test(a.target.key??""))return"CSS \u53D8\u91CF\u540D\u65E0\u6548";if(typeof e!="string"&&typeof e!="number")return"CSS \u53D8\u91CF\u503C\u5FC5\u987B\u662F\u6587\u672C\u6216\u6570\u5B57";if(/[{}<>;]/.test(String(e)))return"CSS \u53D8\u91CF\u503C\u5305\u542B\u4E0D\u5141\u8BB8\u5B57\u7B26";let r=String(a.cssProperty??"").trim();if(r&&globalThis.CSS?.supports&&!globalThis.CSS.supports(r,String(e)))return`\u4E0D\u662F\u5408\u6CD5\u7684 ${r} \u503C`;if(a.allowCustomValue&&Q(a)&&!X(String(e)))return"\u9700\u8981\u5408\u6CD5\u7684 CSS \u989C\u8272\u503C"}return null}function pe(a){let e=new Set;return he(a).map((i,t)=>{if(!i||typeof i!="object"||Array.isArray(i))throw new Error(`schema #${t+1} \u4E0D\u662F\u5BF9\u8C61`);let s=String(i.id??"").trim();if(!s)throw new Error(`schema #${t+1} \u7F3A\u5C11 id`);if(e.has(s))throw new Error(`\u91CD\u590D\u8BBE\u7F6E id: ${s}`);e.add(s);let r=String(i.theme??i.domain??"\u5E94\u7528");return{...i,id:s,theme:r,domain:r,category:String(i.category??"\u901A\u7528"),group:String(i.group??"\u5176\u4ED6"),component:String(i.component??i.module??i.group??i.theme??"\u5E94\u7528"),featureGroup:String(i.featureGroup??i.category??"\u901A\u7528"),label:String(i.label??s),description:String(i.description??""),readOnly:!!i.readOnly,allowCustomValue:!!i.allowCustomValue,cssProperty:i.cssProperty==null?"":String(i.cssProperty),defaultValue:p(i.defaultValue??"")}})}function W(a){return Object.fromEntries(a.map(e=>[e.id,p(e.defaultValue)]))}function E(a,e,{strictUnknown:i=!1,currentValues:t=null}={}){let s=e&&typeof e=="object"&&!Array.isArray(e)?e:{},r=new Set(a.map(l=>l.id)),n=[];if(i)for(let l of Object.keys(s))r.has(l)||n.push(`\u672A\u66B4\u9732\u7684\u8BBE\u7F6E\uFF1A${l}`);let d={};for(let l of a){let o=Object.prototype.hasOwnProperty.call(s,l.id)?s[l.id]:p(l.defaultValue);l.readOnly&&t&&Object.prototype.hasOwnProperty.call(t,l.id)&&(A(o,t[l.id])||n.push(`${l.label} \u662F\u53EA\u8BFB\u8BBE\u7F6E`),o=p(t[l.id]));try{o=ee(l,o)}catch(c){n.push(`${l.label}: ${c.message}`),o=p(l.defaultValue)}let u=te(l,o);u&&n.push(`${l.label}: ${u}`),d[l.id]=o}return{values:d,errors:n}}async function q(a){let e=await fetch(a,{cache:"no-store",credentials:"same-origin"});if(!e.ok)throw new Error(`${e.status} ${e.statusText}`);return e.json()}var v=class{constructor(){this.params=null,this.gui=document.createElement("div"),this.selected=null,this.values=[]}init(e){this.params=e,this.gui.className="las-enum-filter",this._refreshValues(),this._render()}getGui(){return this.gui}isFilterActive(){return this.selected!==null}doesFilterPass(e){if(this.selected===null)return!0;let i=String(this.params.getValue(e.node)??"");return this.selected.has(i)}getModel(){return this.selected===null?null:{values:[...this.selected]}}setModel(e){this.selected=e?.values?new Set(e.values):null,this._refreshValues(),this._render()}afterGuiAttached(){this._refreshValues(),this._render()}onNewRowsLoaded(){this._refreshValues(),this._normaliseSelection(),this._render()}_refreshValues(){let e=new Set;this.params.api.forEachLeafNode(i=>{e.add(String(this.params.getValue(i)??""))}),this.values=[...e].sort((i,t)=>i.localeCompare(t,"zh-CN"))}_normaliseSelection(){if(this.selected===null)return;let e=new Set(this.values);this.selected=new Set([...this.selected].filter(i=>e.has(i))),this.values.length>0&&this.selected.size===this.values.length&&(this.selected=null)}_render(){this.gui.replaceChildren();let e=document.createElement("label");e.className="las-enum-filter-option las-enum-filter-all";let i=document.createElement("input");i.type="checkbox",i.checked=this.selected===null,i.setAttribute("aria-label","All");let t=document.createElement("span");t.textContent="All",i.addEventListener("change",()=>{this.selected=i.checked?null:new Set,this.params.filterChangedCallback(),this._render()}),e.append(i,t),this.gui.append(e);let s=document.createElement("div");s.className="las-enum-filter-divider",this.gui.append(s);for(let r of this.values){let n=document.createElement("label");n.className="las-enum-filter-option";let d=document.createElement("input");d.type="checkbox",d.checked=this.selected===null||this.selected.has(r),d.setAttribute("aria-label",r);let l=document.createElement("span");l.textContent=r,d.addEventListener("change",()=>{let o=this.selected===null?new Set(this.values):new Set(this.selected);d.checked?o.add(r):o.delete(r),this.selected=o.size===this.values.length?null:o,this.params.filterChangedCallback(),this._render()}),n.append(d,l),this.gui.append(n)}}},O=class{constructor(){this.params=null,this.value="",this.gui=document.createElement("div")}init(e){this.params=e,this.value=e.value,this.gui.className="las-color-editor ag-custom-component-popup",this.gui.setAttribute("role","listbox"),this.gui.setAttribute("aria-label","\u989C\u8272\u9009\u9879");for(let i of e.options??[]){let t=document.createElement("button");t.type="button",t.className="las-color-option",t.setAttribute("role","option"),t.setAttribute("aria-selected",String(String(i.value)===String(this.value)));let s=j(i.label,i.value);t.append(...s.childNodes),t.addEventListener("pointerdown",r=>{r.preventDefault(),this.value=i.value,this.params.stopEditing()}),t.addEventListener("keydown",r=>{r.key==="Escape"&&(r.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(t)}}getGui(){return this.gui}getValue(){return this.value}isPopup(){return!0}getPopupPosition(){return"under"}afterGuiAttached(){(this.gui.querySelector('[aria-selected="true"]')||this.gui.querySelector("button"))?.focus({preventScroll:!0})}},L=class{constructor(){this.params=null,this.value="",this.gui=document.createElement("div"),this.input=document.createElement("input")}init(e){this.params=e,this.value=String(e.value??""),this.gui.className="las-custom-value-editor ag-custom-component-popup",this.input.className="las-custom-value-input",this.input.type="text",this.input.value=this.value,this.input.autocomplete="off",this.input.spellcheck=!1,this.input.setAttribute("aria-label","\u81EA\u5B9A\u4E49\u53C2\u6570\u503C"),this.input.addEventListener("input",()=>{this.value=this.input.value}),this.input.addEventListener("keydown",t=>{t.key==="Enter"?(t.preventDefault(),this.value=this.input.value,this.params.stopEditing()):t.key==="Escape"&&(t.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(this.input);let i=document.createElement("p");i.className="las-custom-value-hint",i.textContent="\u53EF\u76F4\u63A5\u8F93\u5165\u5408\u6CD5\u503C\uFF1B\u4E0B\u65B9\u662F\u5E38\u7528\u5019\u9009\u3002",this.gui.append(i);for(let t of e.options??[]){let s=document.createElement("button");if(s.type="button",s.className="las-custom-value-option",s.setAttribute("aria-selected",String(String(t.value)===String(this.value))),e.colorOptions){let r=j(t.label,t.value);s.append(...r.childNodes)}else s.textContent=String(t.label??t.value);s.addEventListener("pointerdown",r=>{r.preventDefault(),this.value=t.value,this.input.value=String(t.value),this.params.stopEditing()}),s.addEventListener("keydown",r=>{r.key==="Escape"&&(r.preventDefault(),this.params.stopEditing(!0))}),this.gui.append(s)}}getGui(){return this.gui}getValue(){return this.value}isPopup(){return!0}getPopupPosition(){return"under"}afterGuiAttached(){this.input.focus({preventScroll:!0}),this.input.setSelectionRange?.(0,this.input.value.length)}},P=class extends HTMLElement{constructor(){super(),this._schema=[],this._values={},this._disabledIds=new Set,this._gridApi=null,this._activeKey=null,this._codeSurface=null,this._updatingSource=!1,this._sourceExtension=null,this._sourceTimer=null,this._historyPast=[],this._historyFuture=[],this._historyCurrent=null,this._lastHistoryKind=null,this._lastHistoryAt=0,this._loading=!1,this._saveInFlight=0,this._latestVersion=m,this._updateTimer=null,this._onVisibilityChange=()=>{document.visibilityState==="visible"&&this._checkForUpdate()}}connectedCallback(){this.dataset.laityMounted!=="1"&&(this.dataset.laityMounted="1",ce(),this._render(),this._mountSourceSurface(),this.reload(),this._startUpdateWatch())}disconnectedCallback(){clearTimeout(this._sourceTimer),clearInterval(this._updateTimer),document.removeEventListener("visibilitychange",this._onVisibilityChange),this._gridApi?.destroy(),this._gridApi=null}validateValues=null;initialValues=null;get explicitSave(){return this.getAttribute("commit-mode")==="explicit"}get values(){return p(this._values)}get disabledIds(){return[...this._disabledIds]}get activeValues(){return Object.fromEntries(Object.entries(this._values).filter(([e])=>!this._disabledIds.has(e)))}get sourceText(){return this._els?.source?.value??""}get sourceComments(){return this.getAttribute("source-comments")!=="false"&&(this.getAttribute("source-comments")==="true"||this.getAttribute("source-editor")==="codemirror"||this.getAttribute("layout")==="horizontal")}async save(){return this._saveSource()}get canUndo(){return this._historyPast.length>0}get canRedo(){return this._historyFuture.length>0}_snapshot(){return{values:p(this._values),disabledIds:[...this._disabledIds],source:this._els?.source?.value??""}}_announceHistory(){this._els?.undo&&(this._els.undo.disabled=!this.canUndo,this._els.redo.disabled=!this.canRedo),this.dispatchEvent(new CustomEvent("laity-settings-history",{bubbles:!0,composed:!0,detail:{canUndo:this.canUndo,canRedo:this.canRedo}}))}_resetHistory(){this._historyPast=[],this._historyFuture=[],this._historyCurrent=this._snapshot(),this._lastHistoryKind=null,this._lastHistoryAt=0,this._announceHistory()}_recordEdit(e){let i=this._snapshot(),t=this._historyCurrent;if(!t){this._historyCurrent=i,this._announceHistory();return}if(JSON.stringify(i)===JSON.stringify(t))return;let s=Date.now();e==="source"&&this._lastHistoryKind==="source"&&s-this._lastHistoryAt<700&&this._historyPast.length>0||(this._historyPast.push(t),this._historyPast.length>100&&this._historyPast.shift()),this._historyCurrent=i,this._historyFuture=[],this._lastHistoryKind=e,this._lastHistoryAt=s,this._announceHistory()}_reconcileCurrentHistory(){this._historyCurrent&&(this._historyCurrent=this._snapshot())}async _travelHistory(e){let i=e==="undo"?this._historyPast:this._historyFuture,t=e==="undo"?this._historyFuture:this._historyPast;if(!i.length)return!1;clearTimeout(this._sourceTimer);let s=i.pop();return t.push(this._historyCurrent||this._snapshot()),this._values=p(s.values),this._disabledIds=new Set(s.disabledIds||[]),this._setSourceText(s.source),this._historyCurrent=this._snapshot(),this._lastHistoryKind=null,this._lastHistoryAt=0,this._refreshGrid(),this._activeKey&&this._highlightKey(this._activeKey),this.explicitSave||(this._applyAll(e),await this._persist(e)),this._announceHistory(),this._setStatus(e==="undo"?"\u5DF2\u64A4\u9500 \xB7 \u5F85\u4FDD\u5B58":"\u5DF2\u91CD\u505A \xB7 \u5F85\u4FDD\u5B58"),!0}undo(){return this._travelHistory("undo")}redo(){return this._travelHistory("redo")}refresh(){this._gridApi?.sizeColumnsToFit(),this._codeSurface?.refresh?.()}setLinkEnabled(e){this._linkEnabled=!!e,e||this._highlightKey(null)}get version(){return m}get latestVersion(){return this._latestVersion}get appId(){return this.getAttribute("app-id")||location.hostname||"app"}get schemaUrl(){return this.getAttribute("schema-url")}get valuesUrl(){return this.getAttribute("values-url")}get saveUrl(){return this.getAttribute("save-url")}get storageMode(){let e=this.getAttribute("storage");return e||(this.saveUrl?"remote":"local")}get storageKey(){return this.getAttribute("storage-key")||`laity.settings.${this.appId}.v1`}_render(){let e=[...this.children].filter(t=>t.hasAttribute("data-laity-footer"));this.innerHTML=`
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
    `;for(let t of e)this.querySelector('[data-role="footer"]').append(t);this._els=Object.fromEntries([...this.querySelectorAll("[data-role]")].map(t=>[t.dataset.role,t])),this._els.undo.addEventListener("click",()=>void this.undo()),this._els.redo.addEventListener("click",()=>void this.redo()),this.addEventListener("keydown",t=>{if(!(t.metaKey||t.ctrlKey)||t.altKey)return;let s=t.key.toLowerCase();if(s!=="z"&&s!=="y")return;let r=s==="y"||t.shiftKey;(r?!this.canRedo:!this.canUndo)||(t.preventDefault(),t.stopPropagation(),r?this.redo():this.undo())},{capture:!0}),this._els.upgrade.addEventListener("click",()=>this._reloadForUpgrade()),this._els.reload.addEventListener("click",()=>void this.reload()),this._els.reset.addEventListener("click",()=>void this.reset()),this._els.format.addEventListener("click",()=>{try{let t=w(this._els.source.value,this._schema);this._setSourceText(N(t.values,this._schema,{comments:this.sourceComments,disabled:t.disabled})),this._recordEdit("format"),this._setStatus("\u6E90\u7801\u5DF2\u683C\u5F0F\u5316 \xB7 \u672A\u4FDD\u5B58")}catch(t){this._setStatus("\u6E90\u7801 JSON \u65E0\u6CD5\u89E3\u6790\uFF1A"+t.message,"error")}}),this._els["save-source"].addEventListener("click",()=>void this._saveSource()),this._els.source.addEventListener("input",()=>{this._recordEdit("source"),this._queueSourcePreview()});let i=()=>this._onSourceCaret(this._els.source.selectionStart);for(let t of["click","keyup","select"])this._els.source.addEventListener(t,i);this._installDivider(),this._installPreviewDivider()}_installPreviewDivider(){if(this.getAttribute("layout")!=="horizontal")return;let e=this._els["preview-divider"],i=r=>{let n=Math.min(65,Math.max(15,r));this.style.setProperty("--las-preview-height",n+"%"),e.setAttribute("aria-valuenow",String(Math.round(n))),this._codeSurface?.refresh?.()},t="laity-settings-preview-height:"+this.appId;try{let r=Number(localStorage.getItem(t));r>=15&&r<=65&&i(r)}catch{}let s=()=>{try{localStorage.setItem(t,e.getAttribute("aria-valuenow"))}catch{}};e.addEventListener("keydown",r=>{["ArrowUp","ArrowDown"].includes(r.key)&&(r.preventDefault(),i((Number(e.getAttribute("aria-valuenow"))||30)+(r.key==="ArrowUp"?2:-2)),s())}),e.addEventListener("pointerdown",r=>{if(r.button!==0)return;r.preventDefault(),e.setPointerCapture(r.pointerId);let n=l=>{let o=this.querySelector(".las-source-col").getBoundingClientRect();i((o.bottom-l.clientY)/o.height*100)},d=()=>{e.removeEventListener("pointermove",n),s()};e.addEventListener("pointermove",n),e.addEventListener("pointerup",d,{once:!0}),e.addEventListener("pointercancel",d,{once:!0})})}_installDivider(){let e=this._els.divider;if(this.getAttribute("layout")!=="horizontal")return;let i=n=>{let o=Math.min(70,Math.max(25,n));this.style.setProperty("--las-left-width",`${o}%`),e.setAttribute("aria-valuenow",String(Math.round(o))),this._gridApi?.sizeColumnsToFit()},t="laity-settings-width:"+this.appId,s=Number(localStorage.getItem(t));s>=25&&s<=70&&i(s);let r=()=>localStorage.setItem(t,e.getAttribute("aria-valuenow"));e.addEventListener("keydown",n=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(n.key))return;n.preventDefault();let d=Number(e.getAttribute("aria-valuenow"))||43;i(d+(n.key==="ArrowRight"||n.key==="ArrowDown"?2:-2)),r()}),e.addEventListener("pointerdown",n=>{if(n.button!==0)return;n.preventDefault(),e.setPointerCapture(n.pointerId);let d=this.querySelector(".las-shell"),l=u=>{let c=d.getBoundingClientRect(),g=window.matchMedia("(max-width:760px)").matches,f=g?(u.clientY-c.top)/c.height:(u.clientX-c.left)/c.width;g?this.style.setProperty("--las-mobile-top",`${Math.round(Math.max(.25,Math.min(.7,f))*100)}%`):i(f*100)},o=()=>{e.removeEventListener("pointermove",l),r()};e.addEventListener("pointermove",l),e.addEventListener("pointerup",o,{once:!0}),e.addEventListener("pointercancel",o,{once:!0})})}async _mountSourceSurface(){if(this.getAttribute("source-editor")==="codemirror")try{await import(this.getAttribute("source-module-url")||oe);let i=document.createElement("laity-source-surface");i.setAttribute("editable","true"),i.setAttribute("line-numbers","true"),i.setAttribute("syntax","jsonc"),i.setAttribute("wrap","true"),i.setAttribute("scroll-container","true"),i.setAttribute("aria-label","\u8BBE\u7F6E\u6E90\u7801"),this._els["code-host"].replaceChildren(i),this._codeSurface=i,i.addEventListener("laity-source-change",t=>{this._updatingSource||(this._els.source.value=t.detail.value,this._recordEdit("source"),this._queueSourcePreview())}),i.addEventListener("laity-source-selection",t=>this._onSourceCaret(t.detail.head)),this._els.source.value&&(i.value=this._els.source.value),this.dataset.sourceReady="true"}catch(e){this.setAttribute("source-editor","textarea"),this.dataset.sourceReady="fallback",this._setStatus("\u5171\u4EAB CodeMirror \u672A\u52A0\u8F7D\uFF0C\u5DF2\u4F7F\u7528\u6807\u51C6\u6587\u672C\u6E90\u7801\uFF1A"+e.message,"error")}}_setSourceText(e){if(this._els.source.value=e,this._codeSurface&&this._codeSurface.value!==e){this._updatingSource=!0;try{this._codeSurface.value=e}finally{this._updatingSource=!1}}}_sourceAnchor(e){return[...I(this._els.source.value),...z(this._els.source.value)].find(i=>i.key===e)}_highlightKey(e,{scroll:i=!1,focus:t=!1}={}){if(this._linkEnabled===!1)return;this._activeKey=e;let s=e?this._sourceAnchor(e):void 0;if(this._gridApi){if(i&&e){let r=this._gridApi.getRowNode(e);r?.rowIndex==null&&this._gridApi.isAnyFilterPresent()&&this._gridApi.setFilterModel(null),r=this._gridApi.getRowNode(e),r?.rowIndex!=null&&this._gridApi.ensureIndexVisible(r.rowIndex,"middle")}this._gridApi.redrawRows()}this._codeSurface?(this._codeSurface.ranges=s?[{from:s.from,to:s.to,role:"group"}]:[],s&&t&&this._codeSurface.revealRange(s.from,s.to,{focus:!0})):s&&t&&(this._els.source.focus(),this._els.source.setSelectionRange(s.from,s.to)),this.dataset.linkedKey=e||"",this._renderPreview()}_onSourceCaret(e){if(this._linkEnabled===!1)return;let t=z(this._els.source.value).find(s=>e>=s.from&&e<=s.end)?.key||U(this._els.source.value,e);t!==this._activeKey&&this._highlightKey(t,{scroll:!0})}selectSetting(e){this._highlightKey(e,{scroll:!0,focus:!0})}_renderPreview(){let e=this._els?.preview;if(!e)return;e.replaceChildren();let i=this._schema.find(l=>l.id===this._activeKey);e.dataset.previewKey=i?.id||"";let t=(l,o,u)=>{let c=document.createElement(l);return o&&(c.className=o),u!=null&&(c.textContent=String(u)),c};if(!i){e.append(t("span","las-preview-title",this.getAttribute("table-layout")==="components"?"\u503C\u9884\u89C8":"\u53C2\u6570\u9884\u89C8"),t("span","las-preview-note","\u9009\u62E9 AG \u884C\u6216\u6E90\u7801\u914D\u7F6E\u9879\u4EE5\u67E5\u770B\u53C2\u6570\u3002"));return}let s=this._values[i.id],r=t("div","las-preview-header");r.append(t("strong","las-preview-title",i.label),t("code","las-preview-key",i.id)),e.append(r);let n=i.description||"\u6B64\u53C2\u6570\u672A\u63D0\u4F9B\u8BF4\u660E\u3002";e.append(t("div","las-preview-note",n));let d=this.getAttribute("table-layout")==="components";if(d){let l=h=>h&&typeof h=="object"?JSON.stringify(h,null,2):JSON.stringify(h),o=t("dl","las-preview-facts"),u=(h,y,b,M=!1)=>{let se=t("dt","",h),C=t("dd","");b&&(C.dataset.previewField=b),C.append(t(M?"pre":"span",M?"las-preview-value":"",y)),o.append(se,C)};u("\u7EC4\u4EF6\u6A21\u5757",i.component,"component"),u("\u529F\u80FD\u7EC4",i.featureGroup,"feature-group"),u("\u53C2\u6570\u540D",i.label,"parameter-name"),u("\u53C2\u6570 ID",i.id,"parameter-id"),u("\u542F\u7528\u72B6\u6001",this._disabledIds.has(i.id)?"\u5DF2\u7981\u7528 \xB7 \u6E90\u7801\u4FDD\u7559\u4E3A\u6CE8\u91CA":"\u5DF2\u542F\u7528","enabled-state"),u("\u7C7B\u578B",x(i),"type"),u("\u5F53\u524D\u503C",l(s),"current-value",!0),u("\u9ED8\u8BA4\u503C",l(i.defaultValue),"default-value",!0),u("\u7F16\u8F91\u6743\u9650",i.readOnly?"\u53EA\u8BFB":"\u53EF\u7F16\u8F91","permission");let c={};for(let h of["required","min","max","pattern","options","allowCustomValue"])i[h]!==void 0&&(c[h]=i[h]);u("\u7EA6\u675F",Object.keys(c).length?JSON.stringify(c,null,2):"\u65E0","constraints",!0),e.append(o);let g=t("details","las-preview-definition");g.append(t("summary","","\u5B8C\u6574\u53C2\u6570\u5B9A\u4E49"));let f=t("pre","las-preview-value",JSON.stringify(i,null,2));f.dataset.previewField="definition",g.append(f),e.append(g)}if(K(i,s)){let l=t("div","las-preview-current"),o=t("div","las-preview-swatch");o.style.background=String(s),o.setAttribute("aria-label","\u5F53\u524D\u989C\u8272\u9884\u89C8"),l.append(o,t("code","",String(s))),e.append(l);let u=t("span","las-preview-key","\u63A8\u8350\u989C\u8272 \xB7 \u70B9\u51FB\u4EE5\u66F4\u65B0\u53C2\u6570\u8349\u7A3F");e.append(u);let c=H(i,s),g=t("div","las-preview-options");for(let f=0;f<3;f++){let h=c[f],y=t("button","las-preview-choice");y.type="button",y.dataset.previewColorSlot=String(f+1),y.disabled=i.readOnly||!h,y.setAttribute("aria-label",h?`\u63A8\u8350\u989C\u8272 ${f+1}\uFF1A${h}`:`\u63A8\u8350\u989C\u8272 ${f+1} \u65E0\u53EF\u7528\u5019\u9009`),y.setAttribute("aria-pressed",String(h===s));let b=t("i","");h&&(b.style.background=h),y.append(b,t("span","",h||"\u65E0\u5019\u9009")),h&&y.addEventListener("click",()=>void this._commitGridValue(i,h)),g.append(y)}e.append(g)}else if(x(i)==="boolean"){let l=t("div","las-preview-bool");l.setAttribute("role","group"),l.setAttribute("aria-label",`${i.label} \xB7 \u4E8C\u9009\u4E00`);for(let o of[!0,!1]){let u=t("button","",o?"\u5F00\u542F \xB7 true":"\u5173\u95ED \xB7 false");u.type="button",u.dataset.previewBoolean=String(o),u.setAttribute("aria-pressed",String(s===o)),u.disabled=i.readOnly,u.addEventListener("click",()=>void this._commitGridValue(i,o)),l.append(u)}e.append(l)}else{if(!d){let l=s&&typeof s=="object"?JSON.stringify(s):String(s??"");e.append(t("div","las-preview-current",l.length>350?l.slice(0,347)+"\u2026":l))}V(i)&&e.append(t("p","las-preview-note","\u590D\u6742\u503C\u8BF7\u5728\u4E0A\u65B9\u6E90\u7801\u7A97\u4FEE\u6539\u3002"))}}_setBusy(e){for(let i of["reload","reset","save-source"])this._els[i].disabled=e}_setStatus(e,i=""){this._els.status.textContent=e,this._els.status.dataset.kind=i}_startUpdateWatch(){document.addEventListener("visibilitychange",this._onVisibilityChange),this._checkForUpdate(),this._updateTimer=window.setInterval(()=>void this._checkForUpdate(),de)}async _checkForUpdate(){try{let e=await fetch(F,{cache:"no-store",credentials:"omit",mode:"cors"});if(!e.ok)return;let i=await e.json(),t=String(i?.version??"").trim();if(!t)return;this._latestVersion=t,this.dataset.latestVersion=t;let s=ue(t,m)>0;if(this._els.update.hidden=!s,!s)return;this._els["update-message"].textContent=`\u53D1\u73B0 Shared Settings v${t}\uFF08\u5F53\u524D v${m}\uFF09`,this.dispatchEvent(new CustomEvent("laity-settings-update-available",{bubbles:!0,composed:!0,detail:{appId:this.appId,currentVersion:m,latestVersion:t,manifestUrl:F}}))}catch{}}_reloadForUpgrade(){let e=new URL(location.href);e.searchParams.set("__settings_v",this._latestVersion||Date.now().toString()),location.replace(e.href)}_localRead(){if(this.storageMode!=="local")return null;try{let e=localStorage.getItem(this.storageKey);return e?JSON.parse(e):null}catch{return null}}_localWrite(e){this.storageMode==="local"&&localStorage.setItem(this.storageKey,JSON.stringify(e))}_localClear(){this.storageMode==="local"&&localStorage.removeItem(this.storageKey)}_readDisabled(){try{let e=JSON.parse(localStorage.getItem(this.storageKey+".disabled.v1")||"[]"),i=new Set(this._schema.map(t=>t.id));return new Set(Array.isArray(e)?e.filter(t=>i.has(t)):[])}catch{return new Set}}_writeDisabled(){try{localStorage.setItem(this.storageKey+".disabled.v1",JSON.stringify([...this._disabledIds]))}catch{}}async setSettingEnabled(e,i){if(!this._schema.some(t=>t.id===e))throw new Error("\u672A\u77E5\u53C2\u6570\uFF1A"+e);return this._disabledIds.has(e)===!i?!1:(i?this._disabledIds.delete(e):this._disabledIds.add(e),this.explicitSave||this._applyAll("enabled-change",[e]),this._syncSource(),this._refreshGrid(),this._recordEdit("enabled"),this._highlightKey(e),this.explicitSave?this._setStatus("\u542F\u7528\u72B6\u6001\u5DF2\u4FEE\u6539 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("enabled-change"),!0)}async reload(){if(!this._loading){if(!this.schemaUrl&&!this.settingsSchema){this._setStatus("\u7F3A\u5C11 schema-url","error");return}this._loading=!0,this.dataset.ready="loading",this._setBusy(!0),this._setStatus("\u6B63\u5728\u8F7D\u5165\u2026");try{this._schema=pe(this.settingsSchema||await q(this.schemaUrl));let e=W(this._schema);if(this.valuesUrl){let s=await q(this.valuesUrl),r=s?.values&&typeof s.values=="object"?s.values:s;e={...e,...r}}this.initialValues&&(e={...e,...p(this.initialValues)});let i=this._localRead();i&&(e={...e,...i});let t=E(this._schema,e);if(t.errors.length)throw new Error(t.errors.join("\uFF1B"));this._values=t.values,this._disabledIds=this._readDisabled(),this._applyAll("reload"),await this._ensureGrid(),this._refreshGrid(),this._syncSource(),this._resetHistory(),!this._activeKey&&this._schema[0]&&this._highlightKey(this._schema[0].id),this.dataset.ready="true",this._setStatus(`\u5DF2\u8F7D\u5165 \xB7 ${this._schema.length} \u9879`,"ok"),this.dispatchEvent(new CustomEvent("laity-settings-ready",{bubbles:!0,composed:!0,detail:{appId:this.appId,version:m,settingCount:this._schema.length}}))}catch(e){this.dataset.ready="error",this._setStatus("\u8F7D\u5165\u5931\u8D25\uFF1A"+(e?.message??String(e)),"error"),this.dispatchEvent(new CustomEvent("laity-settings-load-error",{bubbles:!0,composed:!0,detail:{appId:this.appId,version:m,message:e?.message??String(e)}}))}finally{this._loading=!1,this._setBusy(!1)}}}_rows(){return this._schema.map(e=>{let i=k(e),t=this._values[e.id];return{id:e.id,enabled:!this._disabledIds.has(e.id),theme:e.theme,category:e.category,group:e.group,componentModule:e.component,featureGroup:e.featureGroup,parameterName:e.label,value:V(e)?JSON.stringify(t):String(t??""),description:e.description,optionValues:i.map(s=>String(s.value)),options:i,allowCustomValue:!!e.allowCustomValue,colorOptions:Q(e),complex:V(e),readOnly:e.readOnly,setting:e}})}async _ensureGrid(){if(this._gridApi)return;let{createGrid:e,gridTheme:i}=await Z();this._gridApi||!this.isConnected||(this._gridApi=e(this._els.grid,{theme:i,rowData:[],columnDefs:this.getAttribute("table-layout")==="components"?[this._enabledColumn(),{field:"componentModule",headerName:"\u7EC4\u4EF6\u6A21\u5757",flex:1,minWidth:112,pinned:"left",filter:v,suppressHeaderMenuButton:!0},{field:"featureGroup",headerName:"\u529F\u80FD\u7EC4",flex:1,minWidth:96,filter:v,suppressHeaderMenuButton:!0},{field:"parameterName",headerName:"\u53C2\u6570\u540D",flex:1.2,minWidth:106,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0}]:[this._enabledColumn(),{field:"theme",headerName:"\u4E3B\u9898",width:110,minWidth:96,pinned:"left",filter:v,suppressHeaderMenuButton:!0},{field:"category",headerName:"\u5206\u7C7B",width:120,minWidth:100,filter:v,suppressHeaderMenuButton:!0},{field:"group",headerName:"\u5206\u7EC4",width:120,minWidth:100,filter:v,suppressHeaderMenuButton:!0},{field:"parameterName",headerName:"\u53C2\u6570\u540D",width:180,minWidth:150,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0},{field:"value",headerName:"\u53C2\u6570\u503C",width:230,minWidth:150,flex:1,filter:"agTextColumnFilter",suppressHeaderMenuButton:!0,filterValueGetter:t=>{let s=t.data;return s?s.complex?String(s.value??""):s.options?.find(n=>String(n.value)===String(s.value))?.label??String(s.value??""):""},editable:t=>!t.data?.readOnly&&!t.data?.complex,singleClickEdit:!0,cellEditorSelector:t=>{let s=t.data;if(!(!s||s.readOnly||s.complex))return s.allowCustomValue?{component:L,popup:!0,popupPosition:"under",params:{options:s.options,colorOptions:s.colorOptions}}:s.optionValues?.length?s.colorOptions?{component:O,popup:!0,popupPosition:"under",params:{options:s.options}}:{component:"agSelectCellEditor",params:{values:s.optionValues}}:{component:"agTextCellEditor"}},cellRenderer:t=>{let s=t.data;if(!s)return String(t.value??"");if(s.colorOptions&&!s.complex){let n=s.options?.find(d=>String(d.value)===String(t.value));return j(n?.label??t.value,t.value)}if(s.complex){let n=String(t.value??"");return n.length>44?n.slice(0,41)+"\u2026":n}return s.options?.find(n=>String(n.value)===String(t.value))?.label??String(t.value??"")},valueFormatter:t=>{let s=t.data;if(!s)return String(t.value??"");if(s.complex){let n=String(t.value??"");return n.length>44?n.slice(0,41)+"\u2026":n}return s.options?.find(n=>String(n.value)===String(t.value))?.label??String(t.value??"")}}],defaultColDef:{sortable:!0,resizable:!0,suppressMovable:!0},suppressColumnVirtualisation:!0,suppressMovableColumns:!0,animateRows:!1,rowHeight:40,getRowHeight:()=>40,headerHeight:38,getRowId:t=>t.data.id,getRowClass:t=>[t.data?.id===this._activeKey?"las-linked-row":null,t.data?.enabled===!1?"las-setting-disabled":null].filter(Boolean).join(" "),stopEditingWhenCellsLoseFocus:!0,onRowClicked:t=>{t.data&&(this._highlightKey(t.data.id,{focus:!0}),t.data.complex&&this._setStatus(`${t.data.parameterName}\uFF1A\u590D\u6742\u53C2\u6570\u8BF7\u5728\u6E90\u7801\u533A\u4FEE\u6539`))},onCellValueChanged:t=>{t.colDef.field!=="value"||!t.data||t.newValue!==t.oldValue&&this._commitGridValue(t.data.setting,t.newValue)}}))}_enabledColumn(){return{field:"enabled",headerName:"\u542F\u7528",width:66,minWidth:66,maxWidth:78,pinned:"left",sortable:!1,filter:!1,resizable:!1,suppressHeaderMenuButton:!0,cellRenderer:e=>{let i=document.createElement("label");i.className="las-enabled-toggle";let t=document.createElement("input");return t.type="checkbox",t.checked=!!e.data?.enabled,t.dataset.settingEnabled=e.data?.id||"",t.setAttribute("aria-label","\u542F\u7528 "+(e.data?.parameterName||"\u53C2\u6570")),t.addEventListener("click",s=>s.stopPropagation()),t.addEventListener("change",s=>{s.stopPropagation(),this.setSettingEnabled(e.data.id,t.checked)}),i.append(t),i}}}_refreshGrid(){this._gridApi&&(this._gridApi.setGridOption("rowData",this._rows()),this._gridApi.refreshCells({force:!0}),this._activeKey&&this._gridApi.redrawRows(),this._renderPreview())}_syncSource(){this._setSourceText(N(this._values,this._schema,{comments:this.sourceComments,disabled:this._disabledIds})),this._activeKey&&this._highlightKey(this._activeKey)}_applyAll(e,i=this._schema.map(t=>t.id)){for(let t of this._schema){if(this._disabledIds.has(t.id)){t.target?.type==="css-var"&&document.documentElement.style.removeProperty(t.target.key);continue}let s=this._values[t.id];t.target?.type==="css-var"&&document.documentElement.style.setProperty(t.target.key,String(s))}this.dispatchEvent(new CustomEvent("laity-settings-change",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,changedIds:[...i],values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}))}async _commitGridValue(e,i){let t=p(this._values);try{let s=ee(e,i),r=te(e,s);if(r)throw new Error(r);this._values={...this._values,[e.id]:s},typeof this.validateValues=="function"&&this.validateValues(this._values),this.explicitSave||this._applyAll("grid",[e.id]),this._syncSource(),this._refreshGrid(),this._recordEdit("grid"),this._highlightKey(e.id),this.explicitSave?this._setStatus("\u8868\u683C\u5DF2\u4FEE\u6539 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("grid")}catch(s){this._values=t,this._applyAll("revert",[e.id]),this._syncSource(),this._refreshGrid(),this._setStatus(`${e.label}\uFF1A${s?.message??s}`,"error")}}_queueSourcePreview(){clearTimeout(this._sourceTimer),this._sourceTimer=setTimeout(()=>{try{let e=w(this._els.source.value,this._schema),i=E(this._schema,e.values,{strictUnknown:!0,currentValues:this._values});if(i.errors.length)throw new Error(i.errors.join("\uFF1B"));typeof this.validateValues=="function"&&this.validateValues(i.values);let t=this._schema.filter(s=>!A(this._values[s.id],i.values[s.id])||this._disabledIds.has(s.id)!==e.disabled.has(s.id)).map(s=>s.id);this._values=i.values,this._disabledIds=e.disabled,this._reconcileCurrentHistory(),this.explicitSave||this._applyAll("source-preview",t),this._refreshGrid(),this._setStatus("\u6E90\u7801\u5B9E\u65F6\u9884\u89C8 \xB7 \u672A\u4FDD\u5B58")}catch(e){this._setStatus("\u6E90\u7801\u672A\u5E94\u7528\uFF1A"+(e?.message??String(e)),"error")}},180)}async _saveSource(){clearTimeout(this._sourceTimer);try{let e=w(this._els.source.value,this._schema),i=E(this._schema,e.values,{strictUnknown:!0,currentValues:this._values});if(i.errors.length)throw new Error(i.errors.join("\uFF1B"));typeof this.validateValues=="function"&&this.validateValues(i.values);let t=this._schema.filter(s=>!A(this._values[s.id],i.values[s.id])||this._disabledIds.has(s.id)!==e.disabled.has(s.id)).map(s=>s.id);this._values=i.values,this._disabledIds=e.disabled,this._applyAll("source-save",t),this._refreshGrid(),this._syncSource(),this._reconcileCurrentHistory(),await this._persist("source")}catch(e){this._setStatus("\u6E90\u7801\u4FDD\u5B58\u5931\u8D25\uFF1A"+(e?.message??String(e)),"error")}}async _persist(e){if(this.storageMode==="none"){this._writeDisabled(),this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u7531\u5E94\u7528\u63A5\u7BA1\u6301\u4E45\u5316","ok"),this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}));return}if(this.storageMode==="local"){this._localWrite(this._values),this._writeDisabled(),this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u672C\u673A\u6D4F\u89C8\u5668","ok"),this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}));return}if(!this.saveUrl)throw new Error("remote storage \u7F3A\u5C11 save-url");let i=++this._saveInFlight;this._setStatus("\u6B63\u5728\u4FDD\u5B58\u2026");let t=await fetch(this.saveUrl,{method:this.getAttribute("save-method")||"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({appId:this.appId,reason:e,values:this._values,disabledIds:[...this._disabledIds],clientVersion:m})});if(!t.ok)throw new Error(`${t.status} ${t.statusText}`);if(i===this._saveInFlight){if(this._writeDisabled(),(t.headers.get("content-type")||"").includes("application/json")){let r=await t.json();if(r?.values){let n=E(this._schema,r.values);n.errors.length||(this._values=n.values,this._applyAll("server-canonical"),this._refreshGrid(),this._syncSource(),this._reconcileCurrentHistory())}}this._setStatus("\u5DF2\u4FDD\u5B58 \xB7 \u8FD0\u884C\u65F6\u914D\u7F6E","ok")}this.dispatchEvent(new CustomEvent("laity-settings-saved",{bubbles:!0,composed:!0,detail:{appId:this.appId,reason:e,values:p(this._values),activeValues:p(this.activeValues),disabledIds:[...this._disabledIds],version:m}}))}async reset(){let e=p(this._values),i=new Set(this._disabledIds);try{this._values=W(this._schema),this._disabledIds.clear(),this.explicitSave||this._localClear(),this.explicitSave||this._applyAll("reset"),this._refreshGrid(),this._syncSource(),this._recordEdit("reset"),this.explicitSave?this._setStatus("\u9ED8\u8BA4\u914D\u7F6E\u5DF2\u586B\u5165 \xB7 \u5F85\u4FDD\u5B58"):await this._persist("reset")}catch(t){this._values=e,this._disabledIds=i,this._applyAll("revert"),this._refreshGrid(),this._syncSource(),this._setStatus("\u6062\u590D\u9ED8\u8BA4\u5931\u8D25\uFF1A"+(t?.message??String(t)),"error")}}};customElements.get("laity-settings-panel")||customElements.define("laity-settings-panel",P);export{P as LaitySettingsPanel,m as SHARED_SETTINGS_VERSION,E as normalizeCandidate,pe as normalizeSchema,Ae as preloadSettingsGrid};
