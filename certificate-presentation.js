(function () {
  'use strict';
  const text = value => String(value == null ? '' : value);
  const filled = value => text(value).trim() !== '';
  const date = value => /^\d{4}-\d{2}(?:-\d{2})?$/.test(value || '') ? value.split('-').reverse().join('/') : text(value);
  function orderCode(value) {
    const match = /^OS-(\d{4})-(\d+)$/.exec(text(value));
    return match ? match[2].padStart(6, '0') + '/' + match[1] : text(value);
  }
  function model(source) {
    const helper = window.ancalCertificateTechnical;
    if (!source || !helper) return null;
    // Legacy documents are presented using their own available data only.
    // A supplied snapshot prevents defaults from consulting the live customer catalog.
    const technical = source.technical ? helper.normalize(source.technical) : helper.defaults(source, {
      client: source.client, cnpj: source.cnpj, certificateCustomerId: 'same',
      customerSnapshot: { name: source.client, cnpj: source.cnpj }
    });
    if (!technical) return null;
    const p = technical.parties, i = technical.instrument, e = technical.environment, o = technical.observations;
    const issuer = technical.issuer || {};
    const customer = p.customerSameAsRequester ? { name:p.requesterName, address:p.requesterAddress } : { name:p.customerName, address:p.customerAddress };
    const left = [['Instrumento',source.equipmentName],['Fabricante',i.manufacturer],['Modelo',i.model],['Número de Série',source.serial],['Identificação',source.tag],['Localização',i.location]];
    if (filled(i.className)) left.push(['Classe',i.className]);
    const right = [['Faixa de Indicação',i.range]];
    if (filled(i.resolution)) right.push(['Resolução',i.resolution]);
    if (filled(i.quantity)) right.push(['Quantidade',i.quantity]);
    right.push(['Ordem de Serviço',orderCode(source.orderCode || source.orderId)],['Local da Calibração',i.calibrationPlace],['Data da Calibração',date(source.calibrationDateISO)]);
    if (o.showValidity && filled(o.nextCalibrationISO)) right.push(['Próxima Calibração',date(o.nextCalibrationISO)]);
    [['Capacidade mínima',i.capacityMin],['Capacidade máxima',i.capacityMax],['Divisão',i.division]].forEach(pair=>{if(filled(pair[1]))right.push(pair);});
    const environment = filled(e.liquidTemperature)
      ? [['Temperatura',e.temperature],['Temperatura do Líquido em °C',e.liquidTemperature],['Pressão Barométrica',e.pressure],['Umidade Relativa',e.humidity]]
      : [['Temperatura',e.temperature],['Pressão Barométrica',e.pressure],['Umidade Relativa',e.humidity]];
    const unit = text(technical.results.unit);
    const definition = helper.template(technical.templateId);
    const labels = {
      temperature:{reference:'Valor Indicado Padrão',indication:'Valor Indicado Instrumento'},
      volumetric:{reference:'Referência',indication:'Média das Leituras'},
      mass:{reference:'Valor Nominal',indication:'Valor Instrumento'},
      general:{reference:'Valor Indicado Padrão',indication:'Valor Indicado Instrumento'}
    };
    const columns = definition.columns.map(column=>({key:column.key,label:labels[technical.templateId]?.[column.key] || column.label,unit:['reference','indication','error','uncertainty'].includes(column.key) && technical.templateId !== 'mass' ? unit : ''}));
    const footerLines = [text(issuer.name || source.laboratory || 'Ancal Calibrações')];
    const identity = [filled(issuer.document) ? `${window.ancalIdentity?.label(issuer.document) || 'CPF/CNPJ'}: ${issuer.document}` : '',filled(issuer.stateRegistration) ? `Insc. Estadual: ${issuer.stateRegistration}` : ''].filter(Boolean).join(' / ');
    if(identity)footerLines.push(identity);
    if(filled(issuer.address))footerLines.push(text(issuer.address));
    const contact = [filled(issuer.phone) ? 'Tel.: '+issuer.phone : '',filled(issuer.email) ? 'E-mail: '+issuer.email : '',filled(issuer.website) ? 'Site: '+issuer.website : ''].filter(Boolean).join(' / ');
    if(contact)footerLines.push(contact);
    let signedAt = '';
    if(source.signature?.signedAt && !Number.isNaN(new Date(source.signature.signedAt).getTime()))signedAt=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(source.signature.signedAt));
    const signature = {name:text(source.signature?.name),role:source.signature ? source.signature.role === 'admin' ? 'Administrador(a)' : 'Signatário Autorizado' : '',date:signedAt,status:source.status === 'cancelled' ? 'CERTIFICADO CANCELADO' : source.status === 'signed' && source.signature ? 'Assinatura simulada registrada' : 'RASCUNHO - AGUARDANDO ASSINATURA'};
    const notes = helper.observations(technical);
    if(technical.supplement)notes.push(technical.supplement);
    return {
      title:technical.templateId === 'qualification' ? 'CERTIFICADO DE QUALIFICAÇÃO' : 'CERTIFICADO DE CALIBRAÇÃO',
      code:text(source.code),technical,legacy:!source.technical,
      parties:[['Cliente',customer.name],['Endereço',customer.address],['Solicitante',p.requesterName],['Endereço',p.requesterAddress]],
      instrumentLeft:left,instrumentRight:right,environment,
      standards:technical.standards.map(item=>({...item,validUntilISO:date(item.validUntilISO)})),
      results:{title:technical.templateId === 'temperature' ? `Tabela ${unit === '°C' ? 'Grau Celsius [°C]' : 'de Resultados'}` : technical.templateId === 'mass' ? '' : 'Tabela de Resultados',unit,columns,rows:technical.results.rows,groupMass:technical.templateId === 'mass'},
      procedure:technical.procedure,notes,signature,footer:{lines:footerLines,control:text(issuer.documentControl)},orderCode:orderCode(source.orderCode || source.orderId)
    };
  }
  window.ancalCertificatePresentation={model,orderCode};
}());
