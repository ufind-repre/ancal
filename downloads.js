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

  function equipmentValue(record, key) {
    if (!Array.isArray(record.equipments) || !record.equipments.length) return record[key];
    var items = window.ancalEquipment ? window.ancalEquipment.fromOrder(record) : record.equipments;
    var field = { equipment: 'name', tag: 'tag', serial: 'serial' }[key];
    return items.map(function (item) { return item[field] || 'A informar'; }).join(' | ');
  }

  function exportRecords(records) {
    var columns = [
      ['Ordem de servico', 'id'],
      ['Cliente', 'client'],
      ['CPF/CNPJ', 'cnpj'],
      ['Equipamentos', 'equipment'],
      ['Identificacao', 'tag'],
      ['Modelo / numero de serie', 'serial'],
      ['Local de trabalho', 'workplace'],
      ['Prazo', 'due'],
      ['Status', 'status'],
      ['Responsavel tecnico', 'tech']
    ];
    var rows = [columns.map(function (column) { return csvCell(column[0]); }).join(';')];
    (records || []).forEach(function (record) {
      rows.push(columns.map(function (column) { return csvCell(['equipment', 'tag', 'serial'].includes(column[1]) ? equipmentValue(record, column[1]) : column[1]==='workplace' ? (String(record.workplace||'').trim()||'Nao informado') : record[column[1]]); }).join(';'));
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
    var store = window.ancalCertificates;
    var source = store && store.get(record.certificateRecordId || record.id);
    var isPortal = typeof portalMode !== 'undefined' && portalMode === true;
    // Resolve the canonical record again so a stale button or forged payload cannot release a document.
    if (!source || source.status === 'cancelled' || (isPortal && source.status !== 'signed')) return null;
    if (window.ancalCertificatePDF && window.ancalCertificatePresentation) {
      var detailedPdf = window.ancalCertificatePDF.build(source);
      if (!detailedPdf) return null;
      return saveFile('ANCAL-' + safeFilename(source.code) + '-DEMONSTRACAO.pdf', detailedPdf, 'application/pdf');
    }
    record = {
      id: source.orderId, client: source.client, cnpj: source.cnpj,
      equipment: source.equipmentName, tag: source.tag, serial: source.serial,
      certificateCode: source.code, calibrationDateISO: source.calibrationDateISO,
      activityType: source.activityType, certificateStatus: source.status,
      certificateSignature: source.signature
    };
    var commands = [], streams = [];
    function text(value, x, y, size) {
      commands.push('BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + pdfText(value) + ') Tj ET');
    }
    function header() {
      text('ANCAL', 48, 786, 24);
      text('Gestao metrologica | Prototipo', 48, 763, 11);
      commands.push('0.94 0.45 0.13 RG 2 w 48 745 m 547 745 l S');
      text(record.certificateStatus === 'signed' ? 'CERTIFICADO ILUSTRATIVO' : 'RASCUNHO - AGUARDANDO ASSINATURA', 48, 711, 16);
      text('DOCUMENTO DE DEMONSTRACAO - SEM VALIDADE TECNICA', 48, 685, 10);
    }
    function finishPage() {
      commands.push('0.85 0.87 0.89 RG 0.5 w 48 122 m 547 122 l S');
      text('ASSINATURA SIMULADA. Nao substitui assinatura digital ou aprovacao tecnica.', 48, 103, 9);
      text('Dados ficticios para apresentar o fluxo de consulta e download.', 48, 87, 9);
      text('ANCAL | Demonstracao de interface', 48, 49, 8);
      text(String(streams.length + 1), 520, 49, 8);
      streams.push(commands.join('\n') + '\n');
      commands = [];
    }
    header();
    var y = 650;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(record.calibrationDateISO) ? record.calibrationDateISO.split('-').reverse().join('/') : 'A informar';
    var signed = record.certificateSignature;
    var fields = [
      ['Certificado', record.certificateCode],
      ['Ordem de servico', record.id],
      ['Cliente', record.client],
      [window.ancalIdentity?.label(record.cnpj) || 'CPF/CNPJ', record.cnpj],
      ['Equipamento / identificacao', record.equipment + ' | ' + record.tag],
      ['Modelo / numero de serie', record.serial],
      ['Data da calibracao', date],
      ['Tipo de atividade', record.activityType],
      ['Situacao', record.certificateStatus === 'signed' ? 'Assinado (simulacao)' : 'Aguardando assinatura'],
      ['Assinatura simulada', signed ? signed.name + ' | ' + (signed.role === 'admin' ? 'Administrador' : 'Signatario autorizado') : 'Nao assinado'],
      ['Data e hora da assinatura', signed ? new Date(signed.signedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Sao Paulo)' : 'Pendente']
    ];
    fields.forEach(function (field) {
      var lines = wrap(field[1], 78);
      if (y - (lines.length * 14 + 28) < 140) { finishPage(); header(); y = 650; }
      text(field[0].toUpperCase(), 48, y, 8);
      y -= 17;
      lines.forEach(function (line) {
        if (y < 140) { finishPage(); header(); y = 650; }
        text(line, 48, y, 10);
        y -= 14;
      });
      y -= 9;
    });
    finishPage();
    var objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [' + streams.map(function (_, index) { return (4 + index * 2) + ' 0 R'; }).join(' ') + '] /Count ' + streams.length + ' >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    streams.forEach(function (stream, index) {
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + index * 2) + ' 0 R >>');
      objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
    });
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
    return saveFile('ANCAL-' + safeFilename(record.certificateCode) + '-DEMONSTRACAO.pdf', pdf, 'application/pdf');
  }

  window.ancalDownloads = { exportRecords: exportRecords, certificate: certificate };
})();
