(function () {
  'use strict';
  const clean = value => String(value == null ? '' : value).normalize('NFC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u0000-\u0008\u000b-\u001f]/g,'');
  const shown = value => clean(value).trim() || 'Não informado';
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : clean(value) || 'Não informada';
  const labels = { unknown:'Não informado', none:'Sem embalagem', closed_box:'Caixa fechada', open_box:'Caixa aberta', special:'Embalagem especial', carrier:'Transportadora', customer_delivery:'Entregue pelo cliente', client_pickup:'Coleta no cliente', postal:'Correios', box:'Caixa', laboratory:'Laboratório', field:'Campo' };
  function encoded(value) { return clean(value).replace(/[^\x20-\xff\n]/g,'?').replace(/\n/g,' ').replace(/[\\()\x80-\xff]/g, character => character.charCodeAt(0)>=128 ? '\\'+character.charCodeAt(0).toString(8).padStart(3,'0') : '\\'+character); }
  function width(value,size) { return Array.from(clean(value)).reduce((total,character)=>total+(' ilI.,:;!|\'`'.includes(character)?.28:'mwMW@%&'.includes(character)?.88:/[A-ZÁÉÍÓÚÃÕÇ]/.test(character)?.68:.55),0)*size; }
  function wrap(value,max,size) {
    const output=[];
    clean(value).split(/\r?\n/).forEach(paragraph=>{
      let line='';
      paragraph.split(/\s+/).filter(Boolean).forEach(word=>{
        if(line && width(line+' '+word,size)>max){output.push(line);line='';}
        let rest=word;
        while(width(rest,size)>max){let count=1;while(count<rest.length && width(rest.slice(0,count+1),size)<=max)count++;if(line){output.push(line);line='';}output.push(rest.slice(0,count));rest=rest.slice(count);}
        line=line?line+' '+rest:rest;
      });
      output.push(line);
    });
    return output.length?output:[''];
  }
  function currentRecord(id) {
    if(typeof portalMode!=='undefined' && portalMode)return null;
    return typeof id==='string' ? window.ancalOrders?.get(id) || null : null;
  }
  function build(id) {
    const record=currentRecord(id);
    if(!record)return null;
    const equipment=window.ancalEquipment?.fromOrder(record)||[];
    const closed=window.ancalOrders.isFinalized(record);
    const company=record.customerSnapshot || (!closed ? window.ancalAccess?.getCompanies().find(item=>window.ancalIdentity.key(item.cnpj)===window.ancalIdentity.key(record.cnpj)) : null) || {name:record.client,cnpj:record.cnpj};
    const contact=record.contactSnapshot || {};
    const finalCustomer=record.certificateCustomerId && record.certificateCustomerId!=='same' ? record.certificateCustomerSnapshot : null;
    const logo=window.ancalOrderSheetLogo;
    const hasLogo=logo && Number.isFinite(logo.width) && Number.isFinite(logo.height) && /^[0-9a-f]+$/i.test(logo.hex||'');
    const margin=35, area=525, bottom=74;
    const streams=[]; let commands=[], y=0;
    function text(value,x,baseline,size=8.5,font='F1',color='.12 .16 .20'){commands.push(`${color} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${baseline.toFixed(2)} Td (${encoded(value)}) Tj ET`);}
    function line(x1,y1,x2,y2){commands.push(`.78 .81 .83 RG .45 w ${x1} ${y1} m ${x2} ${y2} l S`);}
    function fill(x,baseline,w,height,color){commands.push(`${color} rg ${x} ${baseline} ${w} ${height} re f`);}
    function header(){
      if(hasLogo)commands.push(`q 48 0 0 ${48*logo.height/logo.width} ${margin} 789 cm /Im1 Do Q`);
      text('Ancal',margin+(hasLogo?52:0),800,25,'F3');text('CALIBRAÇÕES',margin+(hasLogo?54:1),785,7.5);
      const code=wrap('OS: '+(record.code||record.id),235,16);
      code.forEach((value,index)=>text(value,325,805-index*19,16,'F2'));
      const rule=Math.min(770,794-(code.length-1)*19-12);
      line(margin,rule,560,rule);
      text('FICHA DE ACOMPANHAMENTO',margin,rule-18,11,'F2');
      text('Protótipo de demonstração',margin,rule-32,7.5,'F1','.47 .51 .55');
      text(closed?'OS encerrada - somente consulta':'Acompanhamento da ordem de serviço',325,rule-32,7.5);
      y=rule-54;
    }
    function finish(){
      line(margin,59,560,59);
      text('ANCAL Calibrações | Ficha de acompanhamento | Dados de demonstração',margin,46,7,'F1','.43 .47 .51');
      text('Este documento não substitui o certificado de calibração.',margin,34,7,'F1','.43 .47 .51');
      text('Pág. '+(streams.length+1),516,34,7);
      streams.push(commands.join('\n')+'\n');commands=[];
    }
    function page(){finish();header();}
    function ensure(height){if(y-height<bottom)page();}
    function paragraph(value,size=8.5){wrap(shown(value),area-10,size).forEach(valueLine=>{ensure(12);text(valueLine,margin+4,y,size);y-=12;});y-=5;}
    function section(title,reserve=45){ensure(reserve);fill(margin,y-15,area,19,'.94 .95 .96');text(title,margin+5,y-9,8.5,'F2');y-=28;}
    function fields(items,columns=2){
      const w=area/columns;
      for(let index=0;index<items.length;index+=columns){const cells=items.slice(index,index+columns).map(([label,value])=>wrap(label+': '+shown(value),w-12,8.2));const count=Math.max(...cells.map(cell=>cell.length));for(let offset=0;offset<count;offset++){ensure(12);cells.forEach((cell,col)=>{if(cell[offset]!==undefined)text(cell[offset],margin+4+col*w,y,8.2);});y-=12;}y-=4;}
      y-=4;
    }
    function instruments(){
      const columns=[['Código / tag',70],['Tipo',90],['Modelo',75],['Fabricante',75],['Faixas de medição',145],['Validade',70]];
      function tableHeader(){const cells=columns.map(([label,w])=>wrap(label,w-8,7.4));const height=Math.max(...cells.map(cell=>cell.length))*10+10;ensure(height+20);fill(margin,y-height,area,height,'1 .64 .03');let x=margin;cells.forEach((cell,index)=>{cell.forEach((value,lineIndex)=>text(value,x+4,y-10-lineIndex*10,7.4,'F2'));x+=columns[index][1];});y-=height+4;}
      tableHeader();
      equipment.forEach((item,rowIndex)=>{
        const ranges=(Array.isArray(item.measurementRanges)?item.measurementRanges:[]).map(range=>`${range.label}: ${range.min} a ${range.max} ${range.unit}${range.resolution?' (res. '+range.resolution+')':''}`).join('\n');
        const values=[item.tag,item.name,item.model,item.manufacturer,ranges,Number(item.calibrationFrequencyMonths)>0?item.calibrationFrequencyMonths+' meses':'-'];
        const cells=values.map((value,index)=>wrap(shown(value),columns[index][1]-8,7.2));const length=Math.max(...cells.map(cell=>cell.length));let offset=0;
        while(offset<length){if(y-18<bottom){page();tableHeader();}const take=Math.min(length-offset,Math.max(1,Math.floor((y-bottom-8)/10)));const height=take*10+8;if(rowIndex%2===0)fill(margin,y-height,area,height,'.965 .97 .975');let x=margin;cells.forEach((cell,index)=>{cell.slice(offset,offset+take).forEach((value,lineIndex)=>text(value,x+4,y-8-lineIndex*10,7.2));x+=columns[index][1];});y-=height;line(margin,y+1,560,y+1);offset+=take;if(offset<length){page();tableHeader();}}
      });
      if(!equipment.length)paragraph('Instrumentos não informados.');y-=15;
    }
    header();
    fields([
      ['Tipo de serviço',record.service],['Local de execução',labels[record.executionLocation]||record.executionLocation],
      ['Certificados para',finalCustomer?.legalName||finalCustomer?.name||(record.certificateCustomerId==='same'?'O mesmo cliente':'Não informado')],
      ['Acesso ao sistema',typeof record.portalAccessSnapshot==='boolean'?(record.portalAccessSnapshot?'Tem acesso':'Sem acesso'):'Não informado']
    ]);
    section('Dados do cliente e do atendimento');
    fields([
      ['Razão social / nome',company.legalName||company.name||record.client],['CPF / CNPJ',company.cnpj||record.cnpj],
      ['Contato',contact.name],['Telefone',contact.phone||company.phone],
      ['Celular',contact.mobile||company.mobile],['E-mails',(company.emails||[]).join('; ')],
      ['Endereço',[company.address,company.number,company.complement].filter(Boolean).join(', ')],['CEP',company.postalCode],
      ['Bairro',company.neighborhood],['Cidade / UF',[company.city,company.state].filter(Boolean).join(' / ')],
      ['Inscrição estadual',company.stateRegistration],['Nota fiscal',record.hasInvoice?(record.invoiceNote||'Sim'):(record.invoiceNote||'Não informada')],
      ['Entrada',date(record.receivedISO)],['Previsão de saída',date(record.dueISO||record.due)],
      ['Tipo de envio',labels[record.shippingType]||record.shippingType],['Embalagem',labels[record.packaging]||record.packaging],
      ['Nº vendas / proposta',record.proposalNumber],['Local de trabalho',record.workplace]
    ]);
    section('Instrumentos - total: '+equipment.length,90);instruments();
    section('Devolução e acompanhamento',95);
    const final=record.finalization||{};
    paragraph(`Devolução: ${final.returnMode==='pickup'?'[X]':'[ ]'} Retirada     ${final.returnMode==='delivery'?'[X]':'[ ]'} Entrega`);
    fields([['Forma de devolução',labels[record.returnMethod]||record.returnMethod],['Data da devolução',final.returnedISO?date(final.returnedISO):'____/____/________']]);
    paragraph('Observações: '+(final.returnObservations||record.notes||'________________________________________________________________'));
    if(record.executionNotes){paragraph('Execução:');paragraph(record.executionNotes);}
    ensure(43);y-=10;text('Técnico responsável: '+(final.technicalResponsible||'________________________________________'),margin+4,y,8.5);y-=15;
    finish();
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>'];
    if(hasLogo){const data=logo.hex+'>\n';objects.push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${data.length} >>\nstream\n${data}endstream`);}
    const pageStart=objects.length+1;
    objects[1]=`<< /Type /Pages /Kids [${streams.map((_,index)=>`${pageStart+index*2} 0 R`).join(' ')}] /Count ${streams.length} >>`;
    streams.forEach((stream,index)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${hasLogo?' /XObject << /Im1 6 0 R >>':''} >> /Contents ${pageStart+index*2+1} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);});
    let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const start=pdf.length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,'0')+' 00000 n \n';});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return pdf;
  }
  function download(id){
    const pdf=build(id);if(!pdf)return null;
    const record=currentRecord(id);if(!record)return null;
    const filename='ANCAL-Ficha-'+(record.code||record.id).replace(/[^a-zA-Z0-9_-]/g,'-')+'-DEMONSTRACAO.pdf';
    const blob=new Blob([pdf],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.hidden=true;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return filename;
  }
  window.ancalOrderSheet={build,download};
}());
