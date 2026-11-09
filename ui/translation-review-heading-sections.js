/**
 * Read-only presentation adapter for Main's already-rendered Markdown HTML.
 * Move existing top-level heading/content nodes into native details/summary;
 * do not clone content, parse Markdown, cache source offsets or own fold state.
 * Browser details.open remains the sole authority for expanded sections.
 */
const isHeading=node=>/^H[1-6]$/.test(node?.tagName||'');

export function foldRenderedHeadingSections(article){
  if(article.querySelector(':scope > details.ocr-tr-heading-section'))
    throw Error('Heading sections are already folded');
  const fragment=document.createDocumentFragment();
  let content=null,count=0;
  for(const node of [...article.childNodes]){
    if(isHeading(node)){
      const section=document.createElement('details');
      section.className='ocr-tr-heading-section';
      const summary=document.createElement('summary');
      summary.className='ocr-tr-heading-summary';
      summary.append(node);
      content=document.createElement('div');
      content.className='ocr-tr-heading-content';
      section.append(summary,content);
      fragment.append(section);
      count++;
    }else if(content){
      content.append(node);
    }else fragment.append(node);
  }
  article.replaceChildren(fragment);
  return count;
}

export function unfoldRenderedHeadingSections(article){
  let count=0;
  for(const section of [...article.children]){
    if(!section.matches('details.ocr-tr-heading-section'))continue;
    const summary=section.querySelector(':scope > summary.ocr-tr-heading-summary');
    const content=section.querySelector(':scope > .ocr-tr-heading-content');
    const heading=summary?.firstElementChild;
    if(!isHeading(heading)||!content)throw Error('Invalid heading section DOM');
    section.replaceWith(heading,...content.childNodes);
    count++;
  }
  return count;
}
