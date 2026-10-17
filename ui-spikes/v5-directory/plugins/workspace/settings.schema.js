/** Workspace-owned Settings contribution. No Settings internals imported. */
export const settings=Object.freeze([Object.freeze({
 id:'workspaceRemember30Days',label:'记住此设备 30 天',theme:'ocr2md',
 category:'授权',group:'工作目录',component:'工作目录',featureGroup:'授权',
 description:'默认关闭。开启后，在本设备成功输入 Vault 密钥时保留 30 天免输入授权；关闭并保存后立即取消本设备授权。',
 type:'boolean',options:[{label:'关闭',value:false},{label:'开启',value:true}],
 defaultValue:false,readOnly:false,
})]);
