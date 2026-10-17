/** Settings Contract v1: generic per-plugin Schema / validation / persistence.
 * No business names, IDs, imports, or storage layout appear in this module.
 * Runtime registrations come only from the WCP plugin registry composition.
 */
const clone=value=>structuredClone(value);
const idPattern=/^[a-z][a-zA-Z0-9]{1,95}$/;
export function createSettingsModel(localSchema,pluginRegistrations=[]){
 if(!Array.isArray(localSchema)||!Array.isArray(pluginRegistrations))throw Error('SETTINGS_REGISTRY_NOT_ARRAY');
 const entries=[];const owners=new Map();const ids=new Set();
 const add=(owner,items)=>{
  if(!/^[-a-z0-9]+:[-a-z0-9]+$/.test(owner)||!Array.isArray(items))throw Error('SETTINGS_INVALID_OWNER');
  if(owners.has(owner))throw Error('SETTINGS_DUPLICATE_OWNER '+owner);
  const fields=[];
  for(const original of items){
   if(!original||typeof original!=='object'||Array.isArray(original)||!idPattern.test(original.id)||ids.has(original.id))throw Error('SETTINGS_DUPLICATE_OR_INVALID_ID '+original?.id);
   if(!['boolean','string','number','integer'].includes(original.type))throw Error('SETTINGS_INVALID_TYPE '+original.id);
   const item=clone(original);if(validateField(item,item.defaultValue))throw Error('SETTINGS_INVALID_DEFAULT '+item.id);
   item.ownerId=owner;ids.add(item.id);fields.push(item);entries.push(item);
  }
  owners.set(owner,fields);
 };
 add('ocr2md:settings',localSchema);
 for(const item of pluginRegistrations)add(item.ownerId,item.schema);
 const defaults=Object.fromEntries(entries.map(e=>[e.id,clone(e.defaultValue)]));
 const known=new Set(entries.map(x=>x.id));
 const validate=(value,{strict=false}={})=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SETTINGS_VALUES_NOT_OBJECT');
  if(strict)for(const key of Object.keys(value))if(!known.has(key))throw Error('SETTINGS_UNKNOWN_ID '+key);
  const result={...defaults};
  for(const field of entries){
   if(!Object.hasOwn(value,field.id))continue;
   const error=validateField(field,value[field.id]);
   if(error)throw Error(field.id+': '+error);
   result[field.id]=clone(value[field.id]);
  }
  return result;
 };
 const fromStored=raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  const values={...defaults};
  for(const field of entries)if(Object.hasOwn(raw,field.id)&&!validateField(field,raw[field.id]))values[field.id]=clone(raw[field.id]);
  return values;
 };
 const forOwner=(owner,all)=>Object.fromEntries((owners.get(owner)||[]).map(e=>[e.id,clone(all[e.id]??e.defaultValue)]));
 const byOwner=(all)=>[...owners].filter(([owner])=>owner!=='ocr2md:settings').map(([owner])=>({ownerId:owner,values:forOwner(owner,all)}));
 return Object.freeze({schema:entries,defaults,validate,fromStored,forOwner,byOwner,ids:[...ids]});
}
export function validateField(field,value){
 if(field.type==='boolean'&&typeof value!=='boolean')return 'boolean required';
 if(field.type==='string'&&typeof value!=='string')return 'string required';
 if((field.type==='number'||field.type==='integer')&&(typeof value!=='number'||!Number.isFinite(value)))return 'finite number required';
 if(field.type==='integer'&&!Number.isInteger(value))return 'integer required';
 if(['number','integer'].includes(field.type)){
  if(field.min!=null&&value<field.min)return 'below min';
  if(field.max!=null&&value>field.max)return 'above max';
 }
 if(field.type==='string'&&field.pattern&&!(new RegExp(field.pattern)).test(value))return 'invalid pattern';
 if(Array.isArray(field.options)&&field.options.length&&!field.allowCustomValue&&
   !field.options.some(e=>Object.is(e?.value??e,value)))return 'not in options';
 return '';
}
