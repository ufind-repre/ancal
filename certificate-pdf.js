(function () {
  'use strict';
  const clean = value => String(value == null ? '' : value).normalize('NFC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\u03bc/g,'µ').replace(/\u202f|\u00a0/g,' ').replace(/[\u0000-\u0008\u000b-\u001f]/g,'');
  const shown = value => clean(value).trim() || '-';
  const encode = value => clean(value).replace(/[^\x20-\xff\n]/g,'?').replace(/\n/g,' ').replace(/[\\()\x80-\xff]/g,character=>character.charCodeAt(0)>=128?'\\'+character.charCodeAt(0).toString(8).padStart(3,'0'):'\\'+character);
  function width(value,size) {
    return Array.from(clean(value)).reduce((sum,c)=>sum+(' ilI.,:;!|\'`'.includes(c)?.25:'mwMW@%&∞Ω'.includes(c)?.84:/[A-ZÁÉÍÓÚÃÕÇ]/.test(c)?.66:.52),0)*size;
  }
  function wrap(value,max,size) {
    const output=[];
    clean(value).split(/\r?\n/).forEach(paragraph=>{
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(line && width(line+' '+word,size)>max){output.push(line);line='';}
        let rest=word;
        while(width(rest,size)>max){let count=1;while(count<rest.length&&width(rest.slice(0,count+1),size)<=max)count++;if(line){output.push(line);line='';}output.push(rest.slice(0,count));rest=rest.slice(count);}
        line=line?line+' '+rest:rest;
      }
      output.push(line);
    });
    return output.length?output:[''];
  }
  function build(source) {
    const model=window.ancalCertificatePresentation?.model(source);
    if(!model)return null;
    const m=12, right=583, area=571, bodySize=7.8, leading=10.7;
    const footerLines=model.footer.lines.flatMap(value=>wrap(value,area-14,6.7));
    const footerRule=24+footerLines.length*7.5, bottom=footerRule+20;
    const logo=window.ancalOrderSheetLogo;
    const hasLogo=logo&&Number.isFinite(logo.width)&&Number.isFinite(logo.height)&&/^[0-9a-f]+$/i.test(logo.hex||'');
    const streams=[];let commands=[],y=0;
    function text(value,x,baseline,size=bodySize,font='F1',align='left',color='0 0 0'){
      value=clean(value);const w=width(value,size);if(align==='center')x-=w/2;else if(align==='right')x-=w;
      const parts=value.split(/([∞Ω])/);
      for(const part of parts){if(!part)continue;const symbol=part==='∞'?'A':part==='Ω'?'B':null;
        commands.push(`${color} rg BT /${symbol?'FS':font} ${size} Tf ${x.toFixed(2)} ${baseline.toFixed(2)} Td (${symbol||encode(part)}) Tj ET`);x+=width(part,size);
      }
    }
    function rule(x1,y1,x2,y2,color='.5 .5 .5',weight=.4){commands.push(`${color} RG ${weight} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);}
    function fill(x,base,w,height,color){commands.push(`${color} rg ${x.toFixed(2)} ${base.toFixed(2)} ${w.toFixed(2)} ${height.toFixed(2)} re f`);}
    function header(){
      if(hasLogo)commands.push(`q 52 0 0 ${52*logo.height/logo.width} 25 785 cm /Im1 Do Q`);
      text('Ancal',hasLogo?83:25,806,25,'F3','left','.88 .40 .10');
      commands.push('1.1 Tc');text('Calibrações',hasLogo?88:27,791,9,'F3');commands.push('0 Tc');
      const titleLines=wrap(`${model.title} Nº: ${model.code}`,area-20,11.2);
      titleLines.forEach((value,index)=>text(value,297.5,765-index*13,11.2,'F2','center'));
      y=745-(titleLines.length-1)*13;
      if(source.status!=='signed'){text(model.signature.status,297.5,y+6,6.4,'F2','center','.40 .40 .40');y-=5;}
    }
    function finish(){streams.push(commands.join('\n')+'\n');commands=[];}
    function page(){finish();header();}
    function ensure(height){if(y-height<bottom)page();}
    function section(title,reserve=38){ensure(reserve);fill(m,y-12,area,14,'.95 .95 .95');rule(m,y-12,right,y-12,'.55 .55 .55',.35);text(title,m+1,y-8,8,'F2');y-=23;}
    function paragraph(value,size=bodySize){for(const row of wrap(shown(value),area-3,size)){ensure(10.2);text(row,m+1,y,size);y-=10.2;}y-=3;}
    function fieldColumns(columns,widths,labelWidths){
      const max=Math.max(...columns.map(column=>column.length));
      for(let index=0;index<max;index++){
        const cells=columns.map((column,n)=>{const pair=column[index];return pair?{label:wrap(pair[0]+':',labelWidths[n]-4,bodySize),value:wrap(shown(pair[1]),widths[n]-labelWidths[n]-5,bodySize)}:{label:[],value:[]};});
        const count=Math.max(1,...cells.map(cell=>Math.max(cell.label.length,cell.value.length)));
        for(let offset=0;offset<count;offset++){
          ensure(leading);let x=m;
          cells.forEach((cell,n)=>{if(cell.label[offset])text(cell.label[offset],x+1,y,bodySize,'F2');if(cell.value[offset])text(cell.value[offset],x+labelWidths[n],y);x+=widths[n];});y-=leading;
        }
        y-=1;
      }
      y-=4;
    }
    function environment(){
      const count=model.environment.length===4?2:3,w=area/count;
      for(let index=0;index<model.environment.length;index+=count){const row=model.environment.slice(index,index+count),cells=row.map(([label,value])=>{const labelW=Math.min(width(label+':',7.3)*1.08+9,w*.60);return{label,value,labelW,lines:wrap(shown(value),w-labelW-5,7.3)};});
        const n=Math.max(...cells.map(cell=>cell.lines.length));for(let lineIndex=0;lineIndex<n;lineIndex++){ensure(10);cells.forEach((cell,col)=>{if(!lineIndex)text(cell.label+':',m+col*w+1,y,7.3,'F2');if(cell.lines[lineIndex])text(cell.lines[lineIndex],m+col*w+cell.labelW,y,7.3);});y-=10;}y-=2;
      }y-=4;
    }
    function table(columns,rows,options={}){
      const tableWidth=options.width||area,x0=m+(area-tableWidth)/2,columnsWidth=options.widths||columns.map(()=>tableWidth/columns.length),size=options.size||7.5,grid=!!options.grid;
      const positions=[x0];columnsWidth.forEach(w=>positions.push(positions.at(-1)+w));
      function tableHeader(){
        const cells=columns.map((column,index)=>wrap(column.label+(column.unit?'\n'+column.unit:''),columnsWidth[index]-7,size));
        let height=Math.max(...cells.map(cell=>cell.length))*9+6;
        if(options.mass)height=27;
        ensure(height+17);const top=y+3,base=top-height;
        if(options.mass){
          text('Valor de Massa Convencional',(positions[0]+positions[2])/2,top-9,size,'F2','center');
          for(let n=0;n<2;n++)text(columns[n].label,(positions[n]+positions[n+1])/2,top-22,size,'F2','center');
          for(let n=2;n<columns.length;n++)text(columns[n].label,(positions[n]+positions[n+1])/2,top-16,size,'F2','center');
          rule(positions[0],top-13,positions[2],top-13);
          rule(positions[1],top-13,positions[1],base);
          for(let n=2;n<positions.length-1;n++)rule(positions[n],top,positions[n],base);
        }else{cells.forEach((cell,index)=>cell.forEach((value,row)=>text(value,(positions[index]+positions[index+1])/2,top-9-row*9,size,'F2','center')));if(grid)for(let n=1;n<positions.length-1;n++)rule(positions[n],top,positions[n],base);}
        if(grid){rule(x0,top,x0+tableWidth,top);rule(x0,base,x0+tableWidth,base);rule(x0,top,x0,base);rule(x0+tableWidth,top,x0+tableWidth,base);}
        y=base-3;
      }
      tableHeader();const data=rows.length?rows:[{}];
      for(const row of data){const cells=columns.map((column,index)=>wrap(shown(row[column.key]),columnsWidth[index]-7,size));const count=Math.max(...cells.map(cell=>cell.length));let offset=0;
        while(offset<count){if(y-14<bottom){page();tableHeader();}const take=Math.min(count-offset,Math.max(1,Math.floor((y-bottom-5)/9.3)));const top=y+3,height=take*9.3+4,base=top-height;
          cells.forEach((cell,index)=>cell.slice(offset,offset+take).forEach((value,lineIndex)=>text(value,(positions[index]+positions[index+1])/2,y-5-lineIndex*9.3,size,'F1','center')));
          if(grid){for(const x of positions)rule(x,top,x,base);rule(x0,base,x0+tableWidth,base);}
          y=base-3;offset+=take;if(offset<count){page();tableHeader();}
        }
      }y-=5;
    }
    header();
    section('1. Dados do Solicitante');fieldColumns([model.parties],[area],[84]);
    section('2. Dados do Instrumento Calibrado');fieldColumns([model.instrumentLeft,model.instrumentRight],[304,267],[88,99]);
    section('3. Dados do Ambiente');environment();
    section('4. Padrões Utilizados',65);table([{key:'code',label:'Código'},{key:'description',label:'Descrição'},{key:'certificate',label:'Certificado'},{key:'traceability',label:'Rastreabilidade'},{key:'validUntilISO',label:'Validade'}],model.standards,{widths:[63,121,111,194,82],size:7.4});
    section('5. Procedimento');paragraph(model.procedure);
    section('6. Resultados da Calibração',75);
    if(model.results.title){ensure(13);text(model.results.title,m+40,y,8,'F2');y-=13;}
    if(model.results.groupMass&&model.results.unit){ensure(10);text('Unidade: '+model.results.unit,right-38,y,7.5,'F2','right');y-=10;}
    table(model.results.columns,model.results.rows,{width:480,grid:true,mass:model.results.groupMass,size:7.5});
    section('7. Observações');(model.notes.length?model.notes:['-']).forEach(note=>paragraph(note,7.7));
    const signatureLines=wrap(model.signature.name||'Aguardando assinatura',240,8.5);
    if(signatureLines.length>7){
      section('Assinatura');paragraph(model.signature.name||'Aguardando assinatura',8.5);paragraph(model.signature.role,7.5);paragraph(model.signature.date,7);paragraph(model.signature.status,7);
    }else{
      const sigLine=footerRule+50+signatureLines.length*10,signatureTop=sigLine+28;
      if(y<signatureTop+14)page();
      signatureLines.forEach((value,index)=>text(value,297.5,sigLine-10-index*10,8.5,'F3','center'));
      rule(178,sigLine,417,sigLine,'0 0 0',.5);
      text(model.signature.role,297.5,sigLine-10-signatureLines.length*10,7,'F1','center');
      text(model.signature.date,297.5,sigLine-18-signatureLines.length*10,6.7,'F1','center');
      text(model.signature.status,297.5,sigLine-26-signatureLines.length*10,6.7,'F1','center','.35 .35 .35');
    }
    finish();
    const pageStreams=streams.map((stream,index)=>{
      commands=[];rule(m,footerRule,right,footerRule,'0 0 0',.5);
      footerLines.forEach((value,n)=>text(value,297.5,footerRule-11-n*7.5,6.7,'F1','center'));
      const controls=wrap(model.footer.control,area-70,6.2);controls.forEach((value,n)=>text(value,m,footerRule+5+n*7,6.2));
      text(`Pág. ${index+1}/${streams.length}`,right,footerRule+5,7,'F2','right');
      text('DEMONSTRAÇÃO - SEM VALIDADE TÉCNICA | ASSINATURA SIMULADA',297.5,7,5.8,'F1','center','.4 .4 .4');
      return stream+commands.join('\n')+'\n';
    });
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>'];
    const infinityGlyph='840 0 0 0 840 600 d1\n45 w 1 J 1 j 420 300 m 230 550 50 550 50 300 c 50 50 230 50 420 300 c 610 550 790 550 790 300 c 790 50 610 50 420 300 c S\n';
    const omegaGlyph='940 0 0 0 940 800 d1\n48 w 1 J 1 j 70 60 m 310 60 l 310 135 l 100 240 70 440 170 610 c 300 820 640 820 770 610 c 870 440 840 240 630 135 c 630 60 l 870 60 l S\n';
    const unicodeMap='/CIDInit /ProcSet findresource begin\n12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /AncalSymbols def /CMapType 2 def\n1 begincodespacerange <00> <FF> endcodespacerange\n2 beginbfchar <41> <221E> <42> <03A9> endbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end\n';
    [infinityGlyph,omegaGlyph,unicodeMap].forEach(stream=>objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`));
    objects[5]='<< /Type /Font /Subtype /Type3 /Name /AncalSymbols /FontBBox [0 0 940 820] /FontMatrix [.001 0 0 .001 0 0] /CharProcs << /infinity 7 0 R /Omega 8 0 R >> /Encoding << /Type /Encoding /Differences [65 /infinity /Omega] >> /FirstChar 65 /LastChar 66 /Widths [840 940] /Resources << >> /ToUnicode 9 0 R >>';
    const imageId=objects.length+1;
    if(hasLogo){const data=logo.hex+'>\n';objects.push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${data.length} >>\nstream\n${data}endstream`);}
    const startPage=objects.length+1;
    objects[1]=`<< /Type /Pages /Kids [${pageStreams.map((_,n)=>`${startPage+n*2} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`;
    pageStreams.forEach((stream,n)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /FS 6 0 R >>${hasLogo?' /XObject << /Im1 '+imageId+' 0 R >>':''} >> /Contents ${startPage+n*2+1} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);});
    let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=pdf.length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,'0')+' 00000 n \n';});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return pdf;
  }
  window.ancalCertificatePDF={build};
}());
