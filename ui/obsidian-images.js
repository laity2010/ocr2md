/** Obsidian image syntax adapter for the read-only Markdown preview.
 * Owns no document state and never rewrites CMD source or media links.
 */
const dimension=/^([1-9]\d{0,3})(?:x([1-9]\d{0,3}))?$/;
const imageFile=/\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#].*)?$/i;

function imageSize(value){
  const match=dimension.exec(value||'');
  if(!match)return null;
  const width=Number(match[1]),height=match[2]?Number(match[2]):null;
  if(width>8192 || (height!==null&&height>8192))return null;
  return {width,height};
}

export function installObsidianImages(md){
  // wiki image links are NOT standard CommonMark, so they need an inline rule.
  // Other wikilinks (notes, headings, PDF, etc.) remain ordinary text.
  md.inline.ruler.before('image','obsidian-wiki-image',(state,silent)=>{
    const start=state.pos;
    if(state.src.slice(start,start+3)!=='![[')return false;
    const end=state.src.indexOf(']]',start+3);
    if(end<0 || end>state.posMax || state.src.slice(start+3,end).includes('\n'))return false;
    const target=state.src.slice(start+3,end);
    const pipe=target.lastIndexOf('|');
    const size=pipe>=0?imageSize(target.slice(pipe+1)):null;
    const location=(size?target.slice(0,pipe):target).trim();
    if(!location || !imageFile.test(location) || /[\x00-\x1f]/.test(location))return false;
    const src=state.md.normalizeLink(location);
    if(!state.md.validateLink(src))return false;
    if(!silent){
      const token=state.push('image','img',0);
      token.attrSet('src',src);
      const alt=location.split('/').pop().split('#')[0];
      token.attrSet('alt',alt);
      token.content=alt;
      token.children=[{type:'text',content:alt}];
      token.meta={obsidianImageSize:size};
    }
    state.pos=end+2;
    return true;
  });

  const normalImage=md.renderer.rules.image;
  md.renderer.rules.image=(tokens,idx,options,env,self)=>{
    const token=tokens[idx];
    let size=token.meta?.obsidianImageSize || null;
    if(!size){
      // Official Obsidian Markdown-image sizing: ![alt|300](image.png),
      // ![alt|300x200](image.png) and ![300](image.png).
      const alt=token.content || '';
      const pipe=alt.lastIndexOf('|');
      const raw=pipe>=0?alt.slice(pipe+1):alt;
      size=imageSize(raw);
      if(size){
        const label=pipe>=0?alt.slice(0,pipe):'';
        token.content=label;
        token.children=[{type:'text',content:label}];
      }
    }
    if(!size){
      // Additional compatibility with existing nonstandard path|size URLs.
      // markdown-it encodes the literal pipe inside the link destination.
      const src=token.attrGet('src') || '';
      const matched=/(?:\||%7c)([1-9]\d{0,3}(?:x[1-9]\d{0,3})?)$/i.exec(src);
      if(matched){
        size=imageSize(matched[1]);
        if(size)token.attrSet('src',src.slice(0,matched.index));
      }
    }
    if(size){
      token.attrSet('width',String(size.width));
      if(size.height!==null){
        token.attrSet('height',String(size.height));
        // The shared image stylesheet defaults to height:auto; an explicit
        // height must override it to honor 300x200 as requested.
        token.attrSet('style',`height:${size.height}px`);
      }
    }
    token.attrSet('loading','lazy');
    token.attrSet('decoding','async');
    return normalImage(tokens,idx,options,env,self);
  };
}
