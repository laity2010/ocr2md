/** V2 chart_body media: one approved image URL on a physical source line.
 * Shared by media discovery and the Markdown reader; never mutates source. */
const LOCAL=/^media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp)$/;
export function parseBareMediaLine(line){
 const m=/^( {0,3})([^\s<>"']+)[ \t]*$/.exec(line);
 if(!m)return null;
 const url=m[2];
 if(!LOCAL.test(url)){
  if(!url.startsWith('https://cdn-mineru.openxlab.org.cn/')||url.includes('\\')||url.length>2048)return null;
  let parsed;try{parsed=new URL(url);}catch{return null;}
  if(parsed.hostname!=='cdn-mineru.openxlab.org.cn'||parsed.hash||
     !/\.(?:jpe?g|png|gif|webp)$/i.test(parsed.pathname))return null;
 }
 return {url,from:m[1].length,to:m[1].length+url.length};
}
export function findBareMedia(source){
 const refs=[];let offset=0,line=0,fence=null,inComment=false;
 for(const text of source.split('\n')){
  line++;
  const start=offset;offset+=text.length+1;
  const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if(fence){if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;continue;}
  if(inComment||text.includes('<!--')){
   let i=0;
   while(i<text.length){const token=inComment?'-->':'<!--',at=text.indexOf(token,i);if(at<0)break;inComment=!inComment;i=at+token.length;}
   continue;
  }
  if(marker){fence=marker[1];continue;}
  const bare=parseBareMediaLine(text);
  if(!bare)continue;
  const {url}=bare,from=start+bare.from,to=start+bare.to,local=LOCAL.test(url);
  refs.push({id:String(from),from,to,line,url,local,bare:true,status:local?'本地':'待下载',bytes:0,total:null});
 }
 return refs;
}
