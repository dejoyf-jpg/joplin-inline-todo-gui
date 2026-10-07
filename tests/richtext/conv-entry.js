const TurndownService = require('@joplin/turndown/lib/turndown.browser.cjs.js');
const gfm = require('@joplin/turndown-plugin-gfm').gfm;
const MarkdownIt = require('markdown-it');
// Joplin HtmlToMd options (read from the 3.7.21 bundle)
window.htmlToMd = (html) => {
  const t = new TurndownService({ headingStyle: 'atx', anchorNames: [], codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', allowResourcePlaceholders: true, br: '  ', disableEscapeContent: false, tightLists: false, collapseMultipleBlankLines: false });
  t.use(gfm);
  return t.turndown(html);
};
// markdown.plugin.softbreaks=false -> breaks:true. Checkboxes rendered the way
// the Rich Text editor shows them: <ul class="joplin-checklist"><li [class=checked]>
window.mdToHtml = (md) => {
  const html = new MarkdownIt({ html: true, breaks: true }).render(md);
  const d = document.createElement('div'); d.innerHTML = html;
  for (const li of d.querySelectorAll('li')) {
    // A loose list item is <li>\n<p>text</p>: skip whitespace-only nodes
    // before the first text, as Joplin's own renderer does.
    const firstText = (node) => { let n = node.firstChild; while (n && n.nodeType === 3 && !n.data.trim()) n = n.nextSibling; return n; };
    let first = firstText(li);
    if (first && first.nodeType === 1 && first.nodeName === 'P') first = firstText(first);
    if (first && first.nodeType !== 3) first = null;
    if (first) { const m = first.data.match(/^\[([ xX])\] /); if (m) { first.data = first.data.slice(4); li.parentNode.classList.add('joplin-checklist'); if (m[1] !== ' ') li.classList.add('checked'); } }
  }
  return d.innerHTML;
};
