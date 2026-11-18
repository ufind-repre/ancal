(function () {
  'use strict';
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const pad=value=>String(value).padStart(2,'0');
  function render(options) {
    const {id,name,label='Próxima calibração',value='',help='Dia opcional. Selecione mês e ano ou deixe tudo vazio para omitir a informação.'}=options;
    const parts=/^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
    const selected={year:parts?.[1]||'',month:parts?.[2]||'',day:parts?.[3]||''};
    const current=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date()));
    const years=[...new Set([...Array.from({length:current+51-1990},(_,n)=>String(1990+n)),...(selected.year?[selected.year]:[])])].sort();
    const select=(part,caption,values,empty)=>`<label for="${h(id)}-${part}"><span>${caption}</span><select id="${h(id)}-${part}" name="${h(name)}${part[0].toUpperCase()+part.slice(1)}" data-optional-date-part="${part}" aria-label="${h(label)}: ${caption}" aria-describedby="${h(id)}-help ${h(id)}-error"><option value="">${empty}</option>${values.map(([key,title])=>`<option value="${h(key)}"${key===selected[part]?' selected':''}>${h(title)}</option>`).join('')}</select></label>`;
    return `<fieldset class="optional-date" data-optional-date><legend>${h(label)}</legend><div class="optional-date-controls">${select('day','Dia (opcional)',Array.from({length:31},(_,n)=>[pad(n+1),String(n+1)]),'Sem dia')}${select('month','Mês',months.map((month,n)=>[pad(n+1),month]),'Selecione')}${select('year','Ano',years.map(year=>[year,year]),'Selecione')}<button type="button" class="optional-date-clear" data-optional-date-clear aria-label="Limpar ${h(label.toLowerCase())}">Limpar</button></div><input type="hidden" id="${h(id)}" name="${h(name)}" value="${h(value)}" data-optional-date-value${options.field?` data-technical-field="${h(options.field)}"`:''}>${options.precisionField?`<input type="hidden" name="${h(name)}Precision" value="${selected.day?'day':'month'}" data-optional-date-precision data-technical-field="${h(options.precisionField)}">`:''}<small id="${h(id)}-help">${h(help)}</small><p id="${h(id)}-error" class="optional-date-error" role="alert" data-optional-date-error hidden></p></fieldset>`;
  }
  function read(container) {
    const part=name=>container.querySelector(`[data-optional-date-part="${name}"]`)?.value || '';
    const day=part('day'),month=part('month'),year=part('year');
    const precision=day?'day':'month';
    if(!day&&!month&&!year)return{ok:true,value:'',precision:'day',error:''};
    if(!year||!month)return{ok:false,value:'',precision,error:'Selecione o mês e o ano. O dia é opcional.'};
    if(!/^\d{4}$/.test(year)||Number(year)<1000||Number(year)>9999||!/^\d{2}$/.test(month)||Number(month)<1||Number(month)>12)return{ok:false,value:'',precision,error:'Selecione um mês e um ano válidos.'};
    if(day){const max=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();if(!/^\d{2}$/.test(day)||Number(day)<1||Number(day)>max)return{ok:false,value:'',precision,error:'O dia selecionado não existe neste mês e ano. Escolha outro dia ou deixe Sem dia.'};}
    return{ok:true,value:year+'-'+month+(day?'-'+day:''),precision,error:''};
  }
  function sync(container) {
    const result=read(container),input=container.querySelector('[data-optional-date-value]'),precision=container.querySelector('[data-optional-date-precision]'),error=container.querySelector('[data-optional-date-error]');
    if(input)input.value=result.value;
    if(precision)precision.value=result.precision;
    container.querySelectorAll('[data-optional-date-part]').forEach(select=>{select.setCustomValidity('');select.removeAttribute('aria-invalid');});
    if(!result.ok){const target=!container.querySelector('[data-optional-date-part="month"]')?.value?container.querySelector('[data-optional-date-part="month"]'):!container.querySelector('[data-optional-date-part="year"]')?.value?container.querySelector('[data-optional-date-part="year"]'):container.querySelector('[data-optional-date-part="day"]');target?.setCustomValidity(result.error);target?.setAttribute('aria-invalid','true');}
    if(error){error.textContent=result.error;error.hidden=result.ok;}
    return result;
  }
  document.addEventListener('change',event=>{const control=event.target.closest?.('[data-optional-date-part]');if(control)sync(control.closest('[data-optional-date]'));});
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-optional-date-clear]');if(!button)return;event.preventDefault();const container=button.closest('[data-optional-date]');container.querySelectorAll('[data-optional-date-part]').forEach(select=>{select.value='';});sync(container);container.querySelector('[data-optional-date-part="day"]')?.focus();});
  window.ancalOptionalDate={render,read,sync};
}());
