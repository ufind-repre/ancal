(function () {
  'use strict';

  function safeFilename(value) {
    return String(value || 'documento')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'documento';
  }

  function saveFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the URL alive while the browser starts the download.
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return filename;
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    // Prevent spreadsheet applications from interpreting entered text as formulas.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportRecords(records) {
    var columns = [
      ['Ordem de servico', 'id'],
      ['Cliente', 'client'],
      ['CNPJ', 'cnpj'],
      ['Equipamento', 'equipment'],
      ['Identificacao', 'tag'],
      ['Modelo / numero de serie', 'serial'],
      ['Prazo', 'due'],
      ['Status', 'status'],
      ['Responsavel tecnico', 'tech']
    ];
    var rows = [columns.map(function (column) { return csvCell(column[0]); }).join(';')];
    (records || []).forEach(function (record) {
      rows.push(columns.map(function (column) { return csvCell(record[column[1]]); }).join(';'));
    });
    return saveFile('ANCAL-ordens-demonstracao.csv', '\ufeff' + rows.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  }

  function ascii(value) {
    return String(value == null || value === '' ? 'Nao informado' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\x20-\x7e]/g, ' ');
  }

  function pdfText(value) {
    return ascii(value).replace(/[\\()]/g, '\\$&');
  }

  function wrap(text, limit) {
    var remaining = ascii(text);
    var result = [];
    while (remaining.length > limit) {
      var cut = remaining.lastIndexOf(' ', limit);
      if (cut < limit / 2) cut = limit;
      result.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    result.push(remaining);
    return result;
  }

  function certificate(record) {
    record = record || {};
    var commands = [];
    function text(value, x, y, size) {
      commands.push('BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + pdfText(value) + ') Tj ET');
    }
    text('ANCAL', 48, 786, 24);
    text('Gestao metrologica | Prototipo', 48, 763, 11);
    commands.push('0.94 0.45 0.13 RG 2 w 48 745 m 547 745 l S');
    text('CERTIFICADO ILUSTRATIVO', 48, 711, 17);
    text('DOCUMENTO DE DEMONSTRACAO - SEM VALIDADE TECNICA', 48, 685, 10);
    var y = 640;
    var fields = [
      ['Ordem de servico', record.id],
      ['Cliente', record.client],
      ['CNPJ', record.cnpj],
      ['Equipamento', record.equipment],
      ['Identificacao / tag', record.tag],
      ['Modelo / numero de serie', record.serial],
      ['Responsavel tecnico (ficticio)', record.tech],
      ['Prazo informado', record.due],
      ['Status na demonstracao', record.status]
    ];
    fields.forEach(function (field) {
      text(field[0].toUpperCase(), 48, y, 8);
      y -= 17;
      // Two lines per field keep arbitrary entered values inside this single page.
      var lines = wrap(field[1], 78);
      if (lines.length > 2) lines = [lines[0], lines[1].slice(0, 75) + '...'];
      lines.forEach(function (line) {
        text(line, 48, y, 10);
        y -= 14;
      });
      y -= 12;
    });
    commands.push('0.85 0.87 0.89 RG 0.5 w 48 122 m 547 122 l S');
    text('Dados ficticios para apresentar o fluxo de consulta e download.', 48, 103, 9);
    text('Este documento nao registra resultados de calibracao ou aprovacao tecnica.', 48, 87, 9);
    text('ANCAL | Demonstracao de interface', 48, 49, 8);
    text('1 / 1', 520, 49, 8);

    var stream = commands.join('\n') + '\n';
    var objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream'
    ];
    var pdf = '%PDF-1.4\n';
    var offsets = [0];
    objects.forEach(function (object, index) {
      offsets.push(pdf.length);
      pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    });
    var xrefOffset = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(function (offset) {
      pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
    });
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
    return saveFile('ANCAL-' + safeFilename(record.id) + '-DEMONSTRACAO.pdf', pdf, 'application/pdf');
  }

  window.ancalDownloads = { exportRecords: exportRecords, certificate: certificate };
})();
