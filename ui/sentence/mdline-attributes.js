import {markdownLanguage} from '@codemirror/lang-markdown';
export function mdlineTypes(markdown){
 const fences=[];
 if(/(?:\x60{3,}|~{3,})/.test(markdown))markdownLanguage.parser.parse(markdown).iterate({enter(node){
  if(node.name==='FencedCode'){fences.push({from:node.from,to:node.to});return false;}
 }});
 let offset=0,fence=0;
 const lines=markdown.split('\n');if(lines.at(-1)==='')lines.pop();
 return lines.map(text=>{
  while(fence<fences.length&&offset>=fences[fence].to)fence++;
  const code=fences[fence];
  const title=!(code&&offset>=code.from&&offset<code.to)&&/^(#{1,6})(?=\s|$)/.test(text);
  offset+=text.length+1;
  return title?'title':text.trim()===''?'blank':'text';
 });
}
export function quoteLevel(text){
 return '>'.repeat((text.match(/^[ \t]*(?:>[ \t]*)+/)?.[0].match(/>/g)??[]).length);
}
