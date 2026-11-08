import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './lab-home.css';

const build=document.getElementById('build-version');
const status=document.getElementById('status');
fetch('./healthz',{cache:'no-store'}).then(r=>{
  if(!r.ok)throw Error('HTTP '+r.status);
  return r.json();
}).then(({version})=>{
  const match=/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(version||'');
  build.textContent=match?'lab-'+match[1].slice(-2)+match[2]+match[3]+'-'+match[4]+match[5]:'lab-未知';
  build.title=version||'';
  status.textContent='请选择 Lab 独立模块';
}).catch(()=>{
  build.textContent='lab-离线';
  status.textContent='无法读取版本信息；页面导航仍可用';
});
