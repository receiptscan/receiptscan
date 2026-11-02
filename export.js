// =============================================================
// RECEISCAN WEBSITE - EXPORT (Excel at PDF)
// Walang dagdag na library: ang Excel (.xlsx) ay ginagawa dito mismo,
// at ang PDF ay sa "Print → Save as PDF" ng browser (para tama ang ₱).
// =============================================================
(function () {
  // ---------- CRC32 (para sa zip) ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------- Simpleng zip (walang compression) ----------
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 na pangalan
      local.setUint16(8, 0, true); // walang compression
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cenSize = central.reduce((a, p) => a + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const xml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // bawal sa XML ang ilang control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // Isang sheet. Unang row = header (bold). Numero = may format na 0.00.
  // rows: [[...], ...]; moneyCols: index ng mga column na pera
  function sheetXml(rows, moneyCols, widths, hasChart, boldRows) {
    const money = new Set(moneyCols || []);
    const bold = new Set(boldRows || [0]);
    const cols = (widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (bold.has(ri)) return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${money.has(ci) ? 2 : 0}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${hasChart ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  }

  // ---------- BAR GRAPH sa Excel (totoong chart ng Excel) ----------
  // chart: { title, catCol, valCols, first, last, stacked, colors, at: {col,row,w,h} }
  //   first/last = row index (0-based, kasama ang header sa 0) ng data
  function chartXml(sheetName, rows, ch) {
    const q = `'${String(sheetName).replace(/'/g, "''")}'`;
    const ref = (c, r1, r2) => `${q}!$${colName(c)}$${r1 + 1}:$${colName(c)}$${r2 + 1}`;
    const n = ch.last - ch.first + 1;
    const cats = rows.slice(ch.first, ch.last + 1).map((r) => r[ch.catCol]);
    const colors = ch.colors || ['0869EE', '38BDF8', '7FB8FF'];
    const ser = ch.valCols.map((vc, i) => {
      const vals = rows.slice(ch.first, ch.last + 1).map((r) => Number(r[vc]) || 0);
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>
<c:tx><c:strRef><c:f>${q}!$${colName(vc)}$${(ch.headRow || 0) + 1}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(rows[ch.headRow || 0][vc])}</c:v></c:pt></c:strCache></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${colors[i % colors.length]}"/></a:solidFill></c:spPr>
<c:invertIfNegative val="0"/>
<c:cat><c:strRef><c:f>${ref(ch.catCol, ch.first, ch.last)}</c:f><c:strCache><c:ptCount val="${n}"/>${cats.map((v, k) => `<c:pt idx="${k}"><c:v>${xml(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${ref(vc, ch.first, ch.last)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, k) => `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>
</c:ser>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1300" b="1"/><a:t>${xml(ch.title || '')}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="${ch.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>
${ser}
<c:gapWidth val="60"/>${ch.stacked ? '<c:overlap val="100"/>' : ''}
<c:axId val="111"/><c:axId val="222"/></c:barChart>
<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E5EBF4"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
</c:chartSpace>`;
  }
  function drawingXml(ats) {
    const anchor = (at, k) => {
      const a = Object.assign({ col: 0, row: 0, w: 10, h: 18 }, at || {});
      return `<xdr:twoCellAnchor>
<xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${a.col + a.w}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row + a.h}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Chart ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${k + 1}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    };
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${ats.map(anchor).join('')}
</xdr:wsDr>`;
  }

  // sheets: [{ name, rows, moneyCols, widths, chart }]
  function xlsx(filename, sheets) {
    // Bawat sheet: chart (isa) o charts (marami)
    const chartsOf = (s) => (s.charts || (s.chart ? [s.chart] : [])).filter((c) => c && c.last >= c.first);
    let chartNo = 0;
    const plan = sheets.map((s) => chartsOf(s).map((c) => ({ c, no: ++chartNo })));
    const safe = (n, i) => (String(n || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)) || 'Sheet' + (i + 1);
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
${plan.map((p, i) => p.length ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${p.map((x) => `<Override PartName="/xl/charts/chart${x.no}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}` : '').join('')}
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xml(safe(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0869EE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>` },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows, s.moneyCols, s.widths, plan[i].length > 0, s.boldRows) })),
    ];
    // Bar graph ng bawat sheet na may chart (pwedeng marami sa isang sheet)
    sheets.forEach((s, i) => {
      const p = plan[i];
      if (!p.length) return;
      const n = i + 1;
      const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      files.push(
        { name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>` },
        { name: `xl/drawings/drawing${n}.xml`, data: drawingXml(p.map((x) => x.c.at)) },
        { name: `xl/drawings/_rels/drawing${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${p.map((x, k) => `<Relationship Id="rId${k + 1}" Type="${R}/chart" Target="../charts/chart${x.no}.xml"/>`).join('')}</Relationships>` },
        ...p.map((x) => ({ name: `xl/charts/chart${x.no}.xml`, data: chartXml(safe(s.name, i), s.rows, x.c) })),
      );
    });
    download(zip(files), filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- BAR GRAPH sa PDF (SVG) ----------
  // chart: { title, labels, series: [{ name, color, values }], stacked }
  function svgChart(ch) {
    const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const perRow = 5, lgRows = Math.ceil(ch.series.length / perRow);
    const W = 720, H = 250 + lgRows * 16, L = 64, R = 12, T = 16 + lgRows * 16, B = 58;
    const n = ch.labels.length || 1;
    const totals = ch.labels.map((_, i) => ch.stacked
      ? ch.series.reduce((a, s) => a + (Number(s.values[i]) || 0), 0)
      : Math.max(...ch.series.map((s) => Number(s.values[i]) || 0)));
    const max = Math.max(1, ...totals);
    const step = (W - L - R) / n;
    const bw = Math.min(46, step * (ch.stacked ? 0.62 : 0.8));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = max * k / 4, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E5EBF4"/><text x="${L - 6}" y="${yy + 3}" font-size="9" text-anchor="end" fill="#6E86A4">₱${short(v)}</text>`;
    }
    ch.labels.forEach((lab, i) => {
      const cx = L + step * i + step / 2;
      if (ch.stacked) {
        let base = 0;
        ch.series.forEach((s) => {
          const v = Number(s.values[i]) || 0;
          if (v > 0) g += `<rect x="${cx - bw / 2}" y="${y(base + v)}" width="${bw}" height="${y(base) - y(base + v)}" fill="#${s.color}"/>`;
          base += v;
        });
      } else {
        const sw = bw / ch.series.length;
        ch.series.forEach((s, j) => {
          const v = Number(s.values[i]) || 0;
          if (v > 0) g += `<rect x="${cx - bw / 2 + j * sw}" y="${y(v)}" width="${sw - 1}" height="${y(0) - y(v)}" fill="#${s.color}"/>`;
        });
      }
      if (totals[i] > 0) g += `<text x="${cx}" y="${y(totals[i]) - 4}" font-size="8.5" text-anchor="middle" fill="#0D2D57">₱${short(totals[i])}</text>`;
      // Kaunti ang bar (hal. per branch): tuwid ang label. Marami: pahilis.
      const flat = n <= 6;
      const maxCh = flat ? Math.max(6, Math.floor(step / 5.5)) : 12;
      const lb = String(lab).length > maxCh ? String(lab).slice(0, maxCh - 1) + '…' : String(lab);
      g += flat
        ? `<text x="${cx}" y="${H - B + 16}" font-size="9.5" text-anchor="middle" fill="#4D6380">${h(lb)}</text>`
        : `<text x="${cx}" y="${H - B + 14}" font-size="9" text-anchor="end" fill="#4D6380" transform="rotate(-35 ${cx} ${H - B + 14})">${h(lb)}</text>`;
    });
    const legend = ch.series.map((s, j) => { const lx = L + (j % perRow) * 130, ly = 6 + Math.floor(j / perRow) * 16;
      const nm = String(s.name).length > 18 ? String(s.name).slice(0, 17) + '…' : s.name;
      return `<rect x="${lx}" y="${ly}" width="10" height="10" fill="#${s.color}"/><text x="${lx + 14}" y="${ly + 9}" font-size="10" fill="#0D2D57">${h(nm)}</text>`; }).join('');
    return `<div class="chart">${ch.title ? `<div class="chart-t">${h(ch.title)}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">${legend}${g}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#9AAEC6"/></svg></div>`;
  }

  // ---------- PDF: printable na report (Print → Save as PDF) ----------
  // sections: [{ heading, rows, moneyCols, totals }]
  function pdf(title, subtitle, sections) {
    const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = (v, money) => typeof v === 'number' ? (money ? '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)) : h(v);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0D2D57; font-size: 11px; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0869EE; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 18px; margin: 0; color: #0869EE; } .sub { color: #6E86A4; margin-top: 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { background: #0869EE; color: #fff; text-align: left; padding: 6px; font-size: 10.5px; }
  td { padding: 5px 6px; border-bottom: 1px solid #E5EBF4; vertical-align: top; }
  tr:nth-child(even) td { background: #F6F9FD; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 2px solid #0869EE; background: #EAF5FF !important; }
  .foot { margin-top: 14px; color: #8AA0BC; font-size: 9.5px; }
  .hint { margin: 10px 0; padding: 8px 10px; background: #FFF8E6; border-radius: 6px; font-size: 11px; }
  .chart { border: 1px solid #E5EBF4; border-radius: 8px; padding: 8px 10px; margin: 6px 0 10px; page-break-inside: avoid; }
  .chart-t { font-weight: 700; font-size: 11.5px; margin-bottom: 2px; }
  @media print { .hint { display: none; } }
</style></head><body>
<div class="hint">Choose <b>Save as PDF</b> as the printer/destination to download this report as a PDF.</div>
<div class="top"><div><h1>ReceiScan</h1><div class="sub">${h(title)}</div></div><div class="sub" style="text-align:right">${h(subtitle)}<br>Generated ${h(new Date().toLocaleString('en-PH'))}</div></div>
${sections.map((s) => {
  const money = new Set(s.moneyCols || []);
  const [head, ...rows] = s.rows;
  const isNum = (ci) => rows.some((r) => typeof r[ci] === 'number');
  return `${s.heading ? `<h2>${h(s.heading)}</h2>` : ''}${s.chart ? svgChart(s.chart) : ''}<table><thead><tr>${head.map((c, ci) => `<th class="${isNum(ci) ? 'n' : ''}">${h(c)}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v, ci) => `<td class="${typeof v === 'number' ? 'n' : ''}">${fmt(v, money.has(ci))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">No records.</td></tr>`}</tbody>
  ${s.totals ? `<tfoot><tr>${s.totals.map((v, ci) => `<td class="${typeof v === 'number' ? 'n' : ''}">${fmt(v, money.has(ci))}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}).join('')}
<div class="foot">ReceiScan • ${h(title)} • ${h(subtitle)}</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to export the PDF.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  window.Exporter = { xlsx, pdf };
})();
