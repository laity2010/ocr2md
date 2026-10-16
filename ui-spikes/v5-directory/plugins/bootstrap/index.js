/** WP0 technical harness only; not one of the six migrated V4 business plugins.
 * This module is removed/replaced once the first genuine V5 UI plugin is ready.
 */
export const modules=[{
 id:'ocr2md:bootstrap',name:'V5 继承底座',version:'0.1.0',presentation:'full',
 isDirty(){return false},
 mount(host){
  const view=document.createElement('section');
  view.dataset.testid='v5-wp0-bootstrap';
  view.setAttribute('aria-label','V5 WP0 继承底座');
  view.style.cssText='box-sizing:border-box;width:100%;height:100%;background:#1d2732;color:#dce7f1;padding:24px;font:14px/1.7 system-ui,sans-serif';
  const title=document.createElement('h2');title.textContent='OCR2MD V5 · 继承底座';
  const detail=document.createElement('p');
  detail.textContent='WCP、模块发现、CQE 注册和版本化载入已连接。Settings、工作目录、文件服务、章节定界、章节清洗与媒体均未迁移。';
  const notice=document.createElement('p');
  notice.textContent='WP0 只做架构验证：没有 Vault 授权、没有章节编辑、没有文件写入能力。';
  view.append(title,detail,notice);
  host.replaceChildren(view);
 }
}];
export const contracts=[];

