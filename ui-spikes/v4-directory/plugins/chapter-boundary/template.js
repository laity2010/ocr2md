/** V3 chapter boundary controls, preserving original IDs/data-testid and class
 * names used by IrWorkbenchPanel. No duplicate editor or business algorithm. */
export function createBoundaryView(root){
 root.className='v4-chapter-boundary';root.dataset.testid='chapter-boundary-component';
 root.innerHTML=`
 <style>
 .v4-chapter-boundary{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:#1d2732;color:#e1e7ef;font:13px/1.5 var(--v3-ui-font,ui-monospace,monospace);padding:5px}
 .v4-chapter-boundary .boundary-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 7px;background:#253343;border:1px solid #425269}
 .v4-chapter-boundary .boundary-bar button,.v4-chapter-boundary .boundary-bar select,.v4-chapter-boundary input,.v4-chapter-boundary select,.v4-chapter-boundary button{font:inherit;color:inherit}
 .v4-chapter-boundary .boundary-bar button,.v4-chapter-boundary .boundary-bar select{background:#263746;border:1px solid #52647c;border-radius:4px;padding:3px 7px}
 .v4-chapter-boundary .boundary-bar button:disabled{opacity:.5}
 .v4-chapter-boundary .boundary-pane{height:100%;width:100%;min-width:0;min-height:0;position:relative;overflow:hidden;background:#1d2732}
 .v4-chapter-boundary .boundary-title{font-weight:650;font-size:12px;color:#d4e2f3;border-bottom:1px solid #425269;background:#253343;padding:5px 8px;flex:0 0 auto}
 .v4-chapter-boundary .boundary-grid,.v4-chapter-boundary .boundary-editor,.v4-chapter-boundary .boundary-preview{height:100%;width:100%;min-height:0;min-width:0}
 .v4-chapter-boundary #workbench-ir-grid{width:100%;height:100%;min-height:0}
 .v4-chapter-boundary #workbench-ir-source{height:100%;min-height:0;flex:1;overflow:hidden}
 .v4-chapter-boundary #workbench-ir-source .cm-editor{height:100%;background:#1d2732;color:#e1e7ef}
 .v4-chapter-boundary #ir-markdown-preview{height:100%;overflow:auto;padding:8px}
 .v4-chapter-boundary .boundary-pdf{position:relative;width:100%;height:100%;overflow:hidden}
 .v4-chapter-boundary .boundary-track{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}
 .v4-chapter-boundary .boundary-track>section{flex:1;min-height:0;overflow:hidden;position:relative}
 .v4-chapter-boundary [data-level=error]{color:#ffb1a6}
 .v4-chapter-boundary #ir-status{display:block;margin-left:6px;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .v4-chapter-boundary #ir-line-actions{z-index:2000}
 .v4-chapter-boundary .boundary-popover{display:flex;flex-direction:column;gap:7px;padding:8px;max-width:min(330px,calc(100vw - 36px))}
 .v4-chapter-boundary .boundary-popover label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 .v4-chapter-boundary .boundary-popover input[type=text],.v4-chapter-boundary .boundary-popover textarea{max-width:100%;box-sizing:border-box}
 </style>
 <header class="boundary-bar" data-testid="boundary-toolbar">
 <strong>章节定界</strong><span id="boundary-book-label" data-testid="boundary-book-label">请先设为工作目录</span><button id="boundary-cache-prepare" type="button" data-testid="boundary-cache-prepare" hidden>准备工作数据</button><button id="boundary-edit-full" type="button" data-testid="boundary-edit-full" hidden>启用源码编辑</button><button id="boundary-retry" type="button" data-testid="boundary-retry" title="重新读取已设定工作目录的 DIRjson，不会自动保存">重试加载</button><select id="boundary-pdf-file" data-testid="boundary-pdf-file" aria-label="PDF 原文文件" title="选择对应的 PDF 原文"><option value="">等待 PDF</option></select>
 <label id="ir-heading-filters"> <input id="ir-only-h1" data-testid="ir-only-h1" type="checkbox" checked> 只看一级标题</label>
 <label id="ir-sequence-start-control">起始序号 <input id="ir-v2-sequence-start" data-testid="ir-v2-sequence-start" type="text" inputmode="numeric" value="01" size="3"></label>
 <button type="button" id="ir-v2-sequence" data-testid="ir-v2-sequence" hidden disabled>顺序编号</button>
 <label id="ir-ocr-source-choice" hidden>OCR 来源 <select id="ir-ocr-select" data-testid="ir-ocr-select"><option>选择 OCR</option></select></label>
 <select id="ir-md-file" data-testid="ir-md-file" hidden></select>
 <button type="button" id="ir-export-md" data-testid="ir-export-md" hidden>下载 MD</button>
 <button type="button" id="ir-export-zip" data-testid="ir-export-zip" hidden>导出 ZIP</button>
 <details id="ir-chapter-edit-details" class="wb-dropdown"><summary>标定章节</summary>
 <div class="boundary-popover wb-popover">
 <label>标题用途<select id="ir-chapter-role" data-testid="ir-chapter-role"><option value="root">主章节</option><option value="section">小节</option><option value="exclude">非章节标题</option></select></label>
 <label>章节文件名<input id="ir-chapter-file-name" data-testid="ir-chapter-file-name" type="text"></label>
 <label>审核依据<input id="ir-chapter-reason" data-testid="ir-chapter-reason" type="text"></label>
 <button id="ir-chapter-apply" data-testid="ir-chapter-apply" type="button">暂存章节标定</button>
 </div></details>
 <details id="wb-ir-details" class="wb-dropdown"><summary>目录/编辑</summary>
 <div class="boundary-popover wb-popover">
 <div id="ir-chapter-tree" data-testid="ir-chapter-tree" class="ir-chapter-tree"></div>
 <details><summary>当前 OCR 证据</summary><pre id="ir-source-evidence" data-testid="ir-source-evidence"></pre></details>
 <textarea id="ir-edit-text" data-testid="ir-edit-text" rows="4"></textarea>
 <input id="ir-edit-reason" data-testid="ir-edit-reason" placeholder="修改依据" type="text">
 <input id="ir-split-offset" data-testid="ir-split-offset" type="number" min="1">
 <button id="ir-apply-text" data-testid="ir-apply-text">暂存正文校正</button>
 <button id="ir-merge" data-testid="ir-merge">合并下一块</button>
 <button id="ir-split" data-testid="ir-split">拆分</button>
 <button id="ir-move-up" data-testid="ir-move-up">上移</button>
 <button id="ir-move-down" data-testid="ir-move-down">下移</button>
 <button id="ir-boundary" data-testid="ir-boundary">以当前块为章节起点</button>
 <button id="ir-export" data-testid="ir-export">导出草稿</button>
 <span id="ir-dirty-indicator">只读来源</span>
 </div></details>
 <select id="ir-chapter-filter" data-testid="ir-chapter-filter" hidden><option>全部章节</option></select>
 <span id="ir-status" data-testid="ir-status" role="status">等待选择书籍…</span>
 </header>
 <section id="boundary-layout" class="boundary-pane" data-testid="boundary-tripane">
  <div id="boundary-ag" class="boundary-track"><section><div id="workbench-ir-grid" data-testid="workbench-ir-grid"></div></section></div>
  <div id="boundary-source" class="boundary-track"><div class="boundary-title boundary-source-head">DIRjson · 全书源码（可编辑）</div><section><div id="workbench-ir-source" data-testid="workbench-ir-source"></div></section></div>
  <div id="boundary-preview" class="boundary-track"><div class="boundary-title workbench-preview-tabs" role="tablist" aria-label="原文预览类型"><button id="boundary-preview-pdf" type="button" data-testid="boundary-preview-pdf">PDF 原文</button> <button id="boundary-preview-md" type="button" data-testid="boundary-preview-md">MD 预览</button> <button id="boundary-prev" type="button" data-testid="boundary-prev" title="上一页">‹</button> <input id="boundary-page" data-testid="boundary-page" type="number" min="1" value="1" style="width:52px"> <button id="boundary-next" type="button" data-testid="boundary-next" title="下一页">›</button> <button id="boundary-zoomout" type="button" data-testid="boundary-zoomout">−</button>
 <select id="boundary-zoom-value" data-testid="boundary-zoom-value" aria-label="PDF 缩放比例"><option value="page-width">适宽</option><option value="page-fit">整页</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option><option value="200">200%</option><option value="300">300%</option></select>
 <button id="boundary-zoomin" type="button" data-testid="boundary-zoomin">+</button>
 <button id="boundary-pdf-reload" type="button" data-testid="boundary-pdf-reload" title="重新加载 PDF 原文">重载</button></div>
   <section><div id="boundary-pdf-view" class="boundary-pdf" data-testid="boundary-pdf-view"></div><div id="ir-markdown-preview" data-testid="ir-markdown-preview" hidden></div></section>
  </div>
 </section>
 <div id="ir-line-actions" data-testid="ir-line-actions" class="wb-ir-line-menu" role="dialog" hidden>
 <div id="ir-line-action-caption" data-testid="ir-line-action-caption"></div>
 <button id="ir-line-add-title" data-testid="ir-line-add-title">补录标题</button>
 <button id="ir-line-delete-title" data-testid="ir-line-delete-title" hidden>删除补录标题</button>
 <form id="ir-line-title-form" data-testid="ir-line-title-form" hidden>
 <label>标题文字<input id="ir-line-title-text" data-testid="ir-line-title-text" maxlength="350" required></label>
 <label>标题层级<select id="ir-line-title-level" data-testid="ir-line-title-level"><option value="1">H1</option><option value="2">H2</option></select></label>
 <label>PDF 页码<input id="ir-line-title-page" data-testid="ir-line-title-page" type="number" min="1" required></label>
 <label><input id="ir-line-title-confirm" data-testid="ir-line-title-confirm" type="checkbox" required>已核对 PDF</label>
 <button id="ir-line-title-commit" data-testid="ir-line-title-commit" type="submit">补录到 DIRjson</button>
 <button id="ir-line-title-cancel" data-testid="ir-line-title-cancel" type="button">取消</button>
 </form>
 </div>`;
 // The AG pane starts immediately with column headers. Its filters and
 // sequence controls belong to the module toolbar (not a duplicate AG title).
 // All status elements remain internal to V3 for history/subscription consumers.
 // Business actions belong to the module's toolbar strip under the top tabs,
 // not to an AG/CodeMirror pane and not to WCP shell implementation code.
 const toolbarHost=document.getElementById('v4-top-actions');
 if(toolbarHost){
  let group=document.getElementById('boundary-module-tools');
  if(!group){group=document.createElement('div');group.id='boundary-module-tools';
   group.dataset.moduleActionsOwner='ocr2md:chapter-boundary';group.hidden=true;
   toolbarHost.append(group);
  }
  for(const id of ['ir-ocr-source-choice','ir-heading-filters','ir-sequence-start-control','boundary-pdf-file','boundary-retry','boundary-cache-prepare','boundary-edit-full','ir-chapter-edit-details','wb-ir-details']){
    const node=root.querySelector('#'+id);if(node)group.append(node);
  }
 }
 return {ag:root.querySelector('#boundary-ag'),source:root.querySelector('#boundary-source'),preview:root.querySelector('#boundary-preview'),root:root.querySelector('#boundary-layout')};
}
