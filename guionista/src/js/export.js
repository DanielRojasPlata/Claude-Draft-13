/* Exportación: HTML imprimible (para PDF), texto plano */
(function (root) {
  const M = typeof require === 'function' ? require('./model.js') : root.G.model;
  const F = typeof require === 'function' ? require('./formats.js') : root.G.formats;
  const P = typeof require === 'function' ? require('./paginate.js') : root.G.paginate;
  const esc = M.escapeHtml;

  const REVCOLORS = { blue: '#cfe3ff', pink: '#ffd1e0', yellow: '#fff3b0', green: '#d4f5d0', goldenrod: '#f1d28a', buff: '#ead9b7', salmon: '#ffc7b0', cherry: '#f5a3a3' };

  function titlePageHtml(doc, fmt) {
    const m = doc.meta;
    const page = F.PAGES[fmt.pageSize];
    const lines = (s) => esc(s || '').split('\n').join('<br>');
    if (!m.title && !m.author && !m.contact && !m.source && !m.date) return '';
    return `<section class="pg title" style="width:${page.w}in;height:${page.h}in">
  <div class="tp-center" style="top:${page.h * 0.3}in;left:${fmt.margins.left}in;right:${fmt.margins.right}in">
    <div class="tp-title">${lines((m.title || '').toUpperCase())}</div>
    ${m.credit ? `<div class="tp-line">${lines(m.credit)}</div>` : ''}
    ${m.author ? `<div class="tp-line">${lines(m.author)}</div>` : ''}
    ${m.source ? `<div class="tp-line tp-small">${lines(m.source)}</div>` : ''}
  </div>
  <div class="tp-contact" style="left:${fmt.margins.left}in;bottom:${fmt.margins.bottom}in">${lines(m.contact)}</div>
  <div class="tp-date" style="right:${fmt.margins.right}in;bottom:${fmt.margins.bottom}in">${lines([m.draft, m.date].filter(Boolean).join('\n'))}</div>
</section>`;
  }

  function buildHtml(doc, opts) {
    opts = opts || {};
    const fmt = F.resolve(doc);
    const met = F.metrics(fmt);
    const { pages } = P.paginate(doc, fmt);
    const page = met.page;
    const lh = met.lineH;
    const rev = doc.revision;
    const revColor = rev ? REVCOLORS[rev.color] : null;
    let css = `@page{size:${page.w}in ${page.h}in;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${opts.screen ? '#888' : '#fff'}}
body{font-family:${fmt.font};font-size:${fmt.fontSize}pt;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{position:relative;overflow:hidden;background:#fff;page-break-after:always;break-after:page;${opts.screen ? 'margin:12px auto;' : ''}}
.pg:last-child{page-break-after:auto;break-after:auto}
.rows{position:absolute;left:0;right:0;top:${fmt.margins.top}in}
.r{white-space:pre;line-height:${lh}pt;position:relative;height:${lh}pt}
.r.bl{height:${lh}pt}
.pn{position:absolute;top:${Math.max(0.3, fmt.margins.top - 0.5)}in;right:${fmt.margins.right}in;line-height:${lh}pt}
.sn{position:absolute;white-space:pre}
.rv{position:absolute;left:${page.w - fmt.margins.right + 0.15}in}
.wm{position:absolute;left:0;right:0;top:40%;text-align:center;font-size:${fmt.fontSize * 5}pt;color:rgba(0,0,0,.07);transform:rotate(-35deg);font-weight:bold;white-space:nowrap}
.title .tp-center{position:absolute;text-align:center}
.tp-title{font-size:${fmt.fontSize * 1.5}pt;text-decoration:underline;margin-bottom:${lh * 3}pt}
.tp-line{margin-top:${lh}pt}.tp-small{font-size:${fmt.fontSize * 0.85}pt}
.tp-contact,.tp-date{position:absolute;white-space:normal;max-width:3.2in;line-height:${lh}pt}.tp-date{text-align:right}
`;
    for (const t of Object.keys(fmt.elements)) {
      const e = fmt.elements[t];
      css += `.r.t-${t}{margin-left:${e.left}in;width:${e.width}in;text-align:${e.align};font-weight:${e.bold ? 'bold' : 'normal'};font-style:${e.italic ? 'italic' : 'normal'};text-decoration:${e.underline ? 'underline' : 'none'}}\n`;
    }
    css += `.r.t-more,.r.t-contd{font-weight:normal;font-style:normal;text-decoration:none}\n`;
    if (opts.screen) css += '.pg{box-shadow:0 2px 12px rgba(0,0,0,.4)}\n';
    const out = [];
    out.push(titlePageHtml(doc, fmt));
    pages.forEach((rows, pi) => {
      let h = `<section class="pg" style="width:${page.w}in;height:${page.h}in">`;
      if (doc.settings.watermark) h += `<div class="wm">${esc(doc.settings.watermark)}</div>`;
      if (fmt.pageNumbers && pi > 0) h += `<div class="pn">${pi + 1}.</div>`;
      h += '<div class="rows">';
      for (const r of rows) {
        if (r.blank) { h += '<div class="r bl"></div>'; continue; }
        const cls = r.kind === 'more' ? 't-dialogue t-more' : r.kind === 'contd' ? 't-character t-contd' : 't-' + r.type;
        const height = r.spacing > 1 ? `style="height:${lh * r.spacing}pt;line-height:${lh * r.spacing}pt"` : '';
        const e = fmt.elements[r.type] || fmt.elements.action;
        let extra = '';
        if (r.kind === 'more' || r.kind === 'contd') extra = ` style="margin-left:${r.left}in"`;
        let inner = r.html;
        if (r.sceneNo) {
          inner += `<span class="sn" style="left:${-(e.left - 0.7)}in;margin-left:0;text-decoration:none;font-weight:normal">${esc(r.sceneNo)}</span>`;
          inner += `<span class="sn" style="left:${e.width + 0.1}in;text-decoration:none;font-weight:normal">${esc(r.sceneNo)}</span>`;
        }
        if (r.rev && revColor) inner += `<span class="rv" style="left:${page.w - fmt.margins.right + 0.15 - e.left}in;text-decoration:none;font-weight:normal">*</span>`;
        h += `<div class="r ${cls}" ${height || extra}>${inner}</div>`;
        void extra;
      }
      h += '</div></section>';
      out.push(h);
    });
    const body = out.join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(doc.meta.title || 'Guion')}</title><style>${css}</style></head><body>${body}</body></html>`;
  }

  function buildText(doc) {
    const fmt = F.resolve(doc);
    const met = F.metrics(fmt);
    const { pages } = P.paginate(doc, fmt);
    const out = [];
    const m = doc.meta;
    if (m.title) out.push([m.title.toUpperCase(), '', m.credit || '', m.author || ''].join('\n'), '\f');
    pages.forEach((rows, pi) => {
      const lines = [];
      if (pi > 0) lines.push(' '.repeat(Math.max(0, Math.round(met.cols(fmt.margins.left + 6.0 - 0.3)))) + (pi + 1) + '.', '');
      for (const r of rows) {
        if (r.blank) { lines.push(''); continue; }
        const text = M.htmlToText(r.html);
        const width = met.cols(r.width);
        let pad = Math.round(r.left * 72 / met.charW) - Math.round(fmt.margins.left * 72 / met.charW);
        pad = Math.max(0, pad);
        let t = text;
        if (r.align === 'right') t = text.padStart(width);
        else if (r.align === 'center') t = ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
        lines.push(' '.repeat(pad) + t);
        for (let k = 1; k < (r.spacing || 1); k++) lines.push('');
      }
      out.push(lines.join('\n'), pi < pages.length - 1 ? '\f' : '');
    });
    return out.join('\n');
  }

  const api = { buildHtml, buildText, REVCOLORS };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.exporter = api; }
})(typeof self !== 'undefined' ? self : globalThis);
