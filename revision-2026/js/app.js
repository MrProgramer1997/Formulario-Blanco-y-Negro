import {icon} from './icons.js';
import {CONFIG,EVENT,TABLES} from './config.js?v=live-launch-review-20261003-2';
import {createDraft,setQuantity,setGuests,syncResponsible,totals,money,escapeHTML as e,attendees,personErrors,duplicates,toPayload,isEmail,isPhone,storage} from './domain.js?v=member-directory-20261004-2';
import {liveApi,openCheckout} from './api.js?v=member-directory-20261004-2';
import {createLiveCheckoutFlow,TERMINAL_STATES} from './live-checkout.js?v=member-directory-20261004-2';
const $=id=>document.getElementById(id), DRAFT_KEY='bn2026-optional-draft';
const labels=['Tu mesa','Tu grupo','Asistentes','Revisar y pagar'];
const stepHelp=['Elige la ubicaci\u00f3n','Organiza tu mesa','Completa sus datos','Confirma el resumen'];
const stepIcons=['grid','people','list','credit'];
let d=createDraft(),tables=structuredClone(TABLES),prices={...EVENT},zone='all',ready=CONFIG.preview,busy=false,mode='live',salesEnabled=false;
const memberSearchTimers=new Map(),memberSearchSeq=new Map();
const checkoutFlow=createLiveCheckoutFlow(liveApi);
try{const saved=JSON.parse(storage.getItem(DRAFT_KEY)||'null');if(saved?.expires>Date.now()&&saved?.draft?.version===2){const s=saved.draft;if([8,9,10].includes(s.quantity)&&Number.isInteger(s.guests)&&s.guests>=0&&s.guests<=s.quantity&&s.members?.length===10&&s.visitors?.length===10){d=s;d.step=Math.min(3,Math.max(0,s.step));d.terms=false;}}else storage.removeItem(DRAFT_KEY);}catch{storage.removeItem(DRAFT_KEY);}
function persist(){if(d.remember)storage.setItem(DRAFT_KEY,JSON.stringify({expires:Date.now()+7200000,draft:d}));else storage.removeItem(DRAFT_KEY);}
function error(text){$('global-error').textContent=text;$('global-error').hidden=!text;if(text)$('global-error').focus();}
function title(h,p){return `<div class="form-title-row"><span class="section-index">${icon(stepIcons[d.step])}</span><div><h2 tabindex="-1" id="current-title">${h}</h2><p class="subtext">${p}</p></div><span class="step-tag">PASO ${d.step+1} / 4</span></div>`;}
function field(id,label,value,o={}){const max=o.maxlength??(o.type==='email'?254:o.type==='tel'?25:100);return `<div class="field ${o.wide?'wide':''}"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${o.type||'text'}" value="${e(value)}" maxlength="${max}" required ${o.readonly?'readonly':''} ${o.autocomplete?`autocomplete="${o.autocomplete}"`:''} ${o.type==='tel'?'inputmode="tel"':''} placeholder="${e(o.placeholder||'')}" aria-describedby="${id}-error"><small id="${id}-error" class="field-error" hidden></small>${o.hint?`<small>${o.hint}</small>`:''}</div>`;}
async function searchMember(index,value){
 const target=$(`member-results-${index}`);if(!target)return;
 const query=String(value||'').trim(),numeric=/^[0-9]+$/.test(query);
 if(!query||(!numeric&&query.length<3)){target.innerHTML='<p class="small muted">Escribe al menos 3 letras del nombre o el numero exacto de accion.</p>';return;}
 const seq=(memberSearchSeq.get(index)||0)+1;memberSearchSeq.set(index,seq);
 target.innerHTML='<p class="small muted">Buscando socios activos...</p>';
 try{
  const data=await liveApi('member_search',{query});
  if(memberSearchSeq.get(index)!==seq||d.step!==2)return;
  const rows=Array.isArray(data?.rows)?data.rows:[];
  target.innerHTML=rows.length?rows.map(m=>`<button type="button" class="member-result" data-member-id="${e(m.id)}" data-member-index="${index}" data-member-name="${e(m.name)}" data-member-action="${e(m.action)}"><strong>${e(m.name)}</strong><span>Acci&oacute;n ${e(m.action)}</span></button>`).join(''):'<p class="small muted">No encontramos un socio activo con ese dato.</p>';
 }catch(err){
  if(memberSearchSeq.get(index)!==seq)return;
  target.innerHTML=`<p class="small field-error">${e(err.message||'No fue posible consultar la base de socios.')}</p>`;
 }
}
function queueMemberSearch(index,value){
 clearTimeout(memberSearchTimers.get(index));
 memberSearchTimers.set(index,setTimeout(()=>searchMember(index,value),300));
}
const statusName=s=>({available:'Disponible',held:'En pago',confirmed:'Reservada',occupied:'Reservada',blocked:'Bloqueada'}[s]||'No disponible');
function mapHTML(){return `<div class="map"><img src="assets/plano-2026.webp" width="1448" height="1086" alt="Plano Rialto y Lobby. Mesas 1 a 33 en Rialto y 34 a 45 en Lobby.">${tables.map(t=>`<button type="button" class="map-marker ${t.status} ${t.number===d.table?'selected':''}" style="left:${t.x}%;top:${t.y}%" data-table="${t.number}" aria-label="Mesa ${t.number}, ${t.zone}, ${statusName(t.status)}" aria-pressed="${t.number===d.table}" ${t.status!=='available'||!ready?'disabled':''}>${t.number}</button>`).join('')}</div>`;}
function renderTables(){
 $('table-grid').innerHTML=tables.filter(t=>zone==='all'||t.zone===zone).map(t=>`<button type="button" class="table-cell ${t.status==='confirmed'?'occupied':t.status} ${t.number===d.table?'selected':''}" data-table="${t.number}" aria-label="Mesa ${t.number}, ${t.zone}, ${statusName(t.status)}" aria-pressed="${t.number===d.table}" ${t.status!=='available'||!ready?'disabled':''}>${String(t.number).padStart(2,'0')}${t.status!=='available'?`<small>${statusName(t.status)}</small>`:''}</button>`).join('');
 document.querySelectorAll('[data-zone]').forEach(b=>{b.classList.toggle('active',b.dataset.zone===zone);b.setAttribute('aria-pressed',String(b.dataset.zone===zone));});
}
function tableStep(){return title('Elige d&oacute;nde disfrutar la noche','Selecciona una mesa en el plano o en la lista. Mesas de 8 a 10 personas.')+`<div class="map-controls"><div class="legend"><span><i class="dot"></i> Disponible</span><span><i class="dot held"></i> En pago</span><span><i class="dot occupied"></i> Reservada</span></div><button type="button" class="text-button map-zoom" data-action="zoom">${icon("expand")} Ampliar plano</button></div><div id="main-map">${mapHTML()}</div><p class="map-tip">La ubicaci&oacute;n puede cambiar por necesidades de montaje. En celular tambi&eacute;n puedes usar los botones de abajo.</p><div class="table-picker"><div class="picker-heading"><h3>Elige por n&uacute;mero de mesa</h3><div class="segmented" aria-label="Filtrar por zona"><button type="button" data-zone="all">Todas</button><button type="button" data-zone="Rialto">Rialto &middot; 1&ndash;33</button><button type="button" data-zone="Lobby">Lobby &middot; 34&ndash;45</button></div></div><div id="table-grid" class="table-grid"></div></div><div class="selected-box" id="selection-box" ${d.table?'':'hidden'}><span class="check-icon" aria-hidden="true">&#10003;</span><span id="selection-text"></span></div>`;}
function groupStep(){const t=totals(d,prices);return title('Cu&eacute;ntanos qui&eacute;nes van','Un responsable, un solo pago. El responsable puede asistir o reservar para otras personas.')+`<div class="form-subheading">${icon("user")} <span>Datos del responsable</span><small>Todos los campos son obligatorios</small></div><div class="fields">${field('r-firstName','Nombres del responsable',d.responsible.firstName,{autocomplete:'given-name',placeholder:'Nombres completos',maxlength:80})}${field('r-lastName','Apellidos del responsable',d.responsible.lastName,{autocomplete:'family-name',placeholder:'Apellidos completos',maxlength:80})}${field('r-email','Correo electr&oacute;nico',d.responsible.email,{type:'email',autocomplete:'email',placeholder:'nombre@correo.com'})}${field('r-phone','Celular / WhatsApp',d.responsible.phone,{type:'tel',autocomplete:'tel',placeholder:'300 000 0000',maxlength:25})}</div><div class="group-section"><h3>&iquest;Cu&aacute;ntas personas van?</h3><p class="subtext">El total incluye al responsable si tambi&eacute;n asiste.</p><div class="quantity-group" aria-label="Cantidad de asistentes">${[8,9,10].map(n=>`<button type="button" class="quantity-option ${d.quantity===n?'active':''}" data-quantity="${n}" aria-pressed="${d.quantity===n}"><strong>${n}</strong><span>personas</span><span class="quantity-check">${icon("check")}</span></button>`).join('')}</div><div class="distribution"><div class="count-card"><span><span class="count-title">${icon("user")} Socios / corporados</span><small>${money(prices.memberPrice)} por persona</small></span><strong>${t.members}</strong></div><div class="count-card"><span><span class="count-title">${icon("people")} Invitados</span><small>${money(prices.guestPrice)} por persona</small></span><div class="counter"><button type="button" data-guests="-1" aria-label="Quitar un invitado" ${d.guests===0?'disabled':''}>&minus;</button><output aria-label="Cantidad de invitados">${d.guests}</output><button type="button" data-guests="1" aria-label="Agregar un invitado" ${d.guests===d.quantity?'disabled':''}>+</button></div></div></div><p class="small muted">Al agregar invitados, ajustamos la cantidad de socios para mantener ${d.quantity} asistentes.</p><label class="checkbox-row"><input id="responsible-attends" type="checkbox" ${d.responsibleAttends?'checked':''}><span>El responsable tambi&eacute;n asiste.<small>Si asiste como socio, selecci&oacute;nalo en la base de socios. Si asiste como invitado, sus datos se completan autom&aacute;ticamente.</small></span></label>${d.responsibleAttends?`<div class="field inline-select"><label for="responsible-type">Asiste como</label><select id="responsible-type"><option value="member" ${d.responsibleType==='member'?'selected':''}>Socio / corporado</option><option value="guest" ${d.responsibleType==='guest'?'selected':''}>Invitado</option></select></div>`:''}</div><div class="draft-controls"><label class="checkbox-row"><input type="checkbox" id="remember-draft" ${d.remember?'checked':''}><span>Guardar el borrador en esta pesta&ntilde;a durante 2 horas.<small>Opcional. No lo actives en equipos compartidos.</small></span></label><p><button type="button" class="text-button" data-action="clear-draft">Borrar borrador guardado</button></p></div>`;}
function attendeeCard(p,type,i,open){
 const prefix=type==='member'?'m':'g',label=type==='member'?'Socio':'Invitado',own=d.responsibleAttends&&d.responsibleType===type&&i===0,complete=!personErrors(p,type).length;
 const displayName=type==='member'?(p.memberName||'Buscar socio'):[p.firstName,p.lastName].filter(Boolean).join(' ')||'Completar datos';
 let body;
 if(type==='member'){
  body=p.memberId
   ?`<div class="member-selected"><div><small>Socio autorizado</small><strong>${e(p.memberName)}</strong><span>Acci&oacute;n ${e(p.action)}</span></div><button type="button" class="button secondary" data-member-clear="${i}">Cambiar socio</button></div>`
   :`<div class="field wide member-search-field"><label for="m-${i}-search">Buscar socio por nombre o n&uacute;mero de acci&oacute;n</label><input id="m-${i}-search" name="m-${i}-search" type="search" maxlength="80" autocomplete="off" placeholder="Ej. Maria Camila o 48" aria-describedby="m-${i}-search-error"><small id="m-${i}-search-error" class="field-error" hidden></small><small>Selecciona el resultado correcto. Varias personas pueden compartir una misma acci&oacute;n.</small><div id="member-results-${i}" class="member-results" role="listbox"><p class="small muted">Escribe al menos 3 letras del nombre o el n&uacute;mero exacto de acci&oacute;n.</p></div></div>`;
 }else{
  body=`${field(`${prefix}-${i}-firstName`,'Nombres',p.firstName,{readonly:own,placeholder:'Nombres completos',maxlength:80})}${field(`${prefix}-${i}-lastName`,'Apellidos',p.lastName,{readonly:own,placeholder:'Apellidos completos',maxlength:80})}<div class="field"><label for="${prefix}-${i}-docType">Tipo de documento</label><select id="${prefix}-${i}-docType" name="${prefix}-${i}-docType">${[['CC','C&eacute;dula de ciudadan&iacute;a'],['CE','C&eacute;dula de extranjer&iacute;a'],['PAS','Pasaporte'],['OTRO','Otro']].map(([v,t])=>`<option value="${v}" ${p.docType===v?'selected':''}>${t}</option>`).join('')}</select></div>${field(`${prefix}-${i}-document`,'N&uacute;mero de documento',p.document,{placeholder:'Sin espacios ni puntos',maxlength:30})}${field(`${prefix}-${i}-email`,'Correo electr&oacute;nico',p.email,{type:'email',readonly:own,placeholder:'nombre@correo.com'})}${field(`${prefix}-${i}-phone`,'Celular',p.phone,{type:'tel',readonly:own,placeholder:'300 000 0000',maxlength:25})}`;
 }
 return `<details class="attendee" id="person-${prefix}-${i}" ${open?'open':''}><summary><span class="person-name"><span class="person-number">${label.toUpperCase()} ${String(i+1).padStart(2,'0')}${own?' &middot; RESPONSABLE':''}</span><span id="name-${prefix}-${i}">${e(displayName)}</span></span><span id="badge-${prefix}-${i}" class="badge ${complete?'complete':''}">${complete?'Completo':'Por completar'}</span></summary><div class="fields">${body}</div></details>`;
}
function attendeeStep(){const list=attendees(d),completed=list.filter(p=>!personErrors(p,p.type).length).length;let opened=false;const group=(type,label,count)=>count?`<div class="attendee-section-title"><strong>${label} &middot; ${count}</strong><span class="muted">${type==='member'?'Busca y selecciona un socio activo':'Identificaci&oacute;n y contacto'}</span></div>${list.filter(p=>p.type===type).map(p=>{const open=!opened&&personErrors(p,type).length>0;if(open)opened=true;return attendeeCard(p,type,p.index,open);}).join('')}`:'';return title('Registra a todos los asistentes','Abre cada tarjeta y completa los datos. Puedes volver sin perder lo que escribiste.')+`<div class="progress-label"><span><strong id="attendees-complete">${completed}</strong> de ${d.quantity} asistentes completos</span><button type="button" class="text-button" data-action="expand-all">Abrir todos</button></div><div class="progress-track"><div id="attendee-progress" class="progress-fill" style="width:${completed/d.quantity*100}%"></div></div>`+group('member','Socios / corporados',d.quantity-d.guests)+group('guest','Invitados',d.guests);}
function reviewStep(){const t=totals(d,prices);return title('Revisa antes de continuar al pago','Verifica la mesa y los asistentes. La reserva se confirma solamente al validar el pago.')+`<div class="review-heading"><h3>Tu mesa y tu grupo</h3><button type="button" class="text-button" data-edit="0">Cambiar mesa</button></div><div class="review-block"><strong>Mesa ${d.table} &middot; ${tables.find(t=>t.number===d.table)?.zone||''}</strong><p>${d.quantity} personas: ${t.members} socios / corporados y ${t.guests} invitados.</p><p>Viernes 6 de noviembre &middot; 7:00 p. m.</p></div><div class="review-heading"><h3>Responsable</h3><button type="button" class="text-button" data-edit="1">Editar datos</button></div><div class="review-block"><strong>${e(d.responsible.firstName)} ${e(d.responsible.lastName)}</strong><p>${e(d.responsible.email)}</p><p>${e(d.responsible.phone)}</p></div><div class="review-heading"><h3>Asistentes</h3><button type="button" class="text-button" data-edit="2">Editar asistentes</button></div><table class="review-table"><tbody>${attendees(d).map(p=>`<tr><td>${e(p.type==='member'?p.memberName:[p.firstName,p.lastName].filter(Boolean).join(' '))}</td><td>${p.type==='member'?`Socio / corporado &middot; Acci&oacute;n ${e(p.action)}`:'Invitado'}</td></tr>`).join('')}</tbody></table><div class="payment-note"><strong>Total del evento: ${money(t.total)}</strong><p>Un solo pago por la mesa completa. El valor definitivo lo calcula el servidor.</p></div><label class="checkbox-row"><input type="checkbox" id="accepted-terms" ${d.terms?'checked':''} required><span>Confirmo que los datos son correctos, que todos los asistentes son mayores de 18 a&ntilde;os y que conozco el protocolo y las condiciones de cancelaci&oacute;n.<small>Reserva/cancelaci&oacute;n hasta el 30 de octubre. Solicitud de devoluci&oacute;n por fuerza mayor hasta el 23 de octubre; despu&eacute;s no hay reembolso.</small></span></label><div class="notice-box"><strong>Pago seguro con ePayco.</strong> El valor enviado al banco lo calcula el servidor con las tarifas oficiales del evento. No ingresamos ni almacenamos datos de tarjeta en este formulario.</div>`;}
function render(){
 syncResponsible(d);$('stepper').innerHTML=labels.map((label,i)=>`<button type="button" class="step-button ${i===d.step?'active':i<d.step?'done':''}" data-step="${i}" ${i>d.step?'disabled':''} ${i===d.step?'aria-current="step"':''}><span class="step-num">${i<d.step?'&#10003;':String(i+1).padStart(2,'0')}</span><span class="step-copy"><strong>${label}</strong><small>${stepHelp[i]}</small></span><span class="step-icon">${icon(stepIcons[i])}</span></button>`).join('');
 $('step-content').innerHTML=[tableStep,groupStep,attendeeStep,reviewStep][d.step]();$('previous').hidden=d.step===0;$('step-caption').textContent=`Paso ${d.step+1} de 4`;
 $('next').innerHTML=d.step===3?(salesEnabled?'Continuar al pago':'Pago aun no habilitado'):'Continuar <span aria-hidden="true">&#8594;</span>';$('next').disabled=busy||!ready||!!checkoutFlow.operation||(d.step===3&&!salesEnabled);
 if(d.step===0){renderTables();updateSelection();}updateSummary();persist();
}
function updateSelection(){const selected=tables.find(t=>t.number===d.table);if(!$('selection-box'))return;$('selection-box').hidden=!selected;if(selected)$('selection-text').innerHTML=`<strong>Mesa ${selected.number} seleccionada &middot; ${selected.zone}</strong>8 a 10 personas. ${CONFIG.preview?'Selecci&oacute;n de demostraci&oacute;n.':'A&uacute;n no est&aacute; reservada.'}`;}
function updateSummary(){
 const t=totals(d,prices),table=tables.find(x=>x.number===d.table);
 $('summary-table').textContent=table?`Mesa ${table.number}`:'Elige una mesa';$('summary-zone').textContent=table?(table.zone==='Rialto'?'Sal\u00f3n Rialto':'Lobby'):'Sal\u00f3n Rialto o Lobby';
 $('summary-members-label').textContent=`${t.members} socios / corporados`;$('summary-guests-label').textContent=`${t.guests} invitados`;$('summary-members').textContent=money(t.memberTotal);$('summary-guests').textContent=money(t.guestTotal);$('summary-total').textContent=money(t.total);$('mobile-total').textContent=money(t.total);$('mobile-table').textContent=table?`Mesa ${table.number} \u00b7 ${table.zone}`:'Mesa sin elegir';
}
function markInvalid(id,message){const el=$(id);if(!el)return;el.setAttribute('aria-invalid','true');const note=$(id+'-error');if(note){note.textContent=message;note.hidden=false;}}
function validate(step){
 error('');document.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));document.querySelectorAll('.field-error').forEach(n=>n.hidden=true);
 if(step===0){if(!ready){error('No se puede reservar sin verificar la disponibilidad.');return false;}if(!tables.some(t=>t.number===d.table&&t.status==='available')){error('Selecciona una mesa disponible para continuar.');return false;}}
 if(step===1){const r=d.responsible,p=[];if(!r.firstName.trim()||r.firstName.trim().length>80)p.push(['r-firstName','Escribe los nombres del responsable.']);if(!r.lastName.trim()||r.lastName.trim().length>80)p.push(['r-lastName','Escribe los apellidos del responsable.']);if(!isEmail(r.email))p.push(['r-email','Escribe un correo electr\u00f3nico v\u00e1lido.']);if(!isPhone(r.phone))p.push(['r-phone','Escribe un celular v\u00e1lido.']);p.forEach(x=>markInvalid(...x));if(p.length){error('Revisa los campos se\u00f1alados antes de continuar.');$(p[0][0]).focus();return false;}}
 if(step===2){const bad=attendees(d).map(p=>({p,errors:personErrors(p,p.type)})).filter(x=>x.errors.length);if(bad.length){for(const {p,errors}of bad){const pre=p.type==='member'?'m':'g',card=$(`person-${pre}-${p.index}`);card.open=true;card.classList.add('error');errors.forEach(k=>markInvalid(`${pre}-${p.index}-${k}`,k==='email'?'Revisa el correo.':k==='phone'?'Revisa el celular.':'Completa este dato correctamente.'));}error(`Faltan datos en ${bad.length} asistentes. Revisa las tarjetas se\u00f1aladas.`);const p=bad[0].p;$(`${p.type==='member'?'m':'g'}-${p.index}-${bad[0].errors[0]}`)?.focus();return false;}if(duplicates(d)){error('Hay un asistente repetido. Cada socio o invitado debe aparecer una sola vez.');return false;}}
 if(step===3&&!d.terms){error('Confirma los datos y las condiciones antes de continuar.');$('accepted-terms').focus();return false;}return true;
}
function move(step){d.step=step;error('');render();$('booking').scrollIntoView({block:'start',behavior:'smooth'});$('current-title')?.focus({preventScroll:true});}
function updateAttendeeProgress(){
 const list=attendees(d),n=list.filter(p=>!personErrors(p,p.type).length).length;if(!$('attendees-complete'))return;$('attendees-complete').textContent=n;$('attendee-progress').style.width=`${n/d.quantity*100}%`;
 list.forEach(p=>{const pre=p.type==='member'?'m':'g',ok=!personErrors(p,p.type).length,name=$(`name-${pre}-${p.index}`),badge=$(`badge-${pre}-${p.index}`);if(name)name.textContent=(p.type==='member'?p.memberName:[p.firstName,p.lastName].filter(Boolean).join(' '))||'Completar datos';if(badge){badge.textContent=ok?'Completo':'Por completar';badge.classList.toggle('complete',ok);}$(`person-${pre}-${p.index}`)?.classList.remove('error');});
}
function showNotice(title,html){$('notice-title').textContent=title;$('notice-body').innerHTML=html;$('notice-dialog').showModal();}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verifyProviderSignal(r){
 checkoutFlow.markClosed();
 paintPendingOperation();
 const message=$('active-payment-message');
 if(message)message.textContent='ePayco cerró la ventana o entregó una respuesta. Estamos verificando el estado real antes de continuar.';
 for(let attempt=0;attempt<40;attempt++){
  try{
   const state=await checkoutFlow.status();
   if(TERMINAL_STATES.includes(state.status)||state.status==='review'){
    location.href='resultado.html?id='+encodeURIComponent(r.reservationId);
    return;
   }
  }catch{}
  await wait(attempt<10?1500:3000);
 }
 paintPendingOperation();
 if($('active-payment-message'))$('active-payment-message').textContent='Todavía no hay un resultado final verificado. No repitas el pago. Puedes consultar Ver resultado o continuar el mismo intento si no enviaste la transacción.';
}
async function openExistingCheckout(r){
 checkoutFlow.markOpened();
 try{
  await openCheckout(r.sessionId,false,event=>{
   if(event?.bnEvent==='closed'){
    checkoutFlow.markClosed();
    paintPendingOperation();
    $('active-payment-message').textContent='La ventana de ePayco se cerro. Verificaremos automaticamente el estado real antes de permitir otro pago.';
    $('active-payment').scrollIntoView({block:'center',behavior:'smooth'});
    void verifyProviderSignal(r);
    return;
   }
   if(event?.bnEvent==='error'){
    checkoutFlow.markClosed();
    paintPendingOperation();
    error('ePayco no terminó de mostrar el resultado. Verificaremos el intento existente; no vuelvas a pagar.');
    void verifyProviderSignal(r);
    return;
   }
   // ePayco puede emitir onResponse también al cerrar/cancelar el Checkout.
   // Nunca navegamos por ese evento solamente: primero verificamos el servidor.
   void verifyProviderSignal(r);
  });
 }catch(err){checkoutFlow.markClosed();paintPendingOperation();throw err;}
}
function paintPendingOperation(){
 let panel=$('active-payment');
 if(!panel){panel=document.createElement('section');panel.id='active-payment';panel.className='notice-box';$('booking').prepend(panel);}
 const op=checkoutFlow.operation;
 panel.hidden=!op;
 if(!op)return;
 const id=op.result?.reservationId||op.reservationId;
 const review=op.status==='review';
 panel.innerHTML='<strong>Ya tienes un intento registrado en esta pestana.</strong><p id="active-payment-message">'+(review?'Esta operacion requiere revision. No inicies otro pago.':'Consultaremos su estado antes de permitir otro pago.')+'</p>'+(id?'<a class="button secondary" href="resultado.html?id='+encodeURIComponent(id)+'">Ver resultado</a> ':'')+(!review&&!op.opened&&!TERMINAL_STATES.includes(op.status)?'<button class="button secondary" type="button" id="retry-same-payment">Continuar el mismo intento</button> ':'')+(!review?'<button class="button secondary" type="button" id="finish-payment">Consultar y preparar otra reserva</button>':'');
 $('retry-same-payment')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{const r=await checkoutFlow.retry();await openExistingCheckout(r);paintPendingOperation();}catch(err){error(err.message);}finally{busy=false;}});
 $('finish-payment').addEventListener('click',async()=>{if(busy)return;busy=true;try{await checkoutFlow.clearFinished();d=createDraft();storage.removeItem(DRAFT_KEY);error('');paintPendingOperation();await catalog();render();}catch(err){$('active-payment-message').textContent=err.message;}finally{busy=false;$('next').disabled=!ready||!!checkoutFlow.operation||(d.step===3&&!salesEnabled);}});
 if(op.closed)$('active-payment-message').textContent='El Checkout se cerro. Si no enviaste el pago, continua el mismo intento. Si ya lo enviaste, usa Ver resultado. La mesa no se libera por cerrar la ventana.';
 $('next').disabled=true;
}
async function pay(){
 if(mode!=='live'||CONFIG.paymentEnvironment!=='live'||!ready||!salesEnabled){error('Las reservas comerciales todavia no estan habilitadas.');return;}
 if(checkoutFlow.operation){paintPendingOperation();error('Consulta el intento existente. No se generara otro pago.');return;}
 busy=true;$('next').disabled=true;$('next').textContent='Preparando el pago...';
 try{
  const expectedAmount=totals(d,prices).total;
  const r=await checkoutFlow.begin(toPayload(d),expectedAmount);
  storage.removeItem(DRAFT_KEY);
  await openExistingCheckout(r);
 }catch(err){
  error(err.message||'No fue posible abrir ePayco. Consulta el intento antes de repetir.');
  if(!checkoutFlow.operation)await catalog();
 }
 finally{
  busy=false;
  paintPendingOperation();
  $('next').disabled=!ready||!!checkoutFlow.operation||(d.step===3&&!salesEnabled);
  $('next').textContent=salesEnabled?'Continuar al pago':'Pago aun no habilitado';
 }
}
$('reservation-form').addEventListener('submit',ev=>{ev.preventDefault();if(busy||!validate(d.step))return;if(d.step<3)move(d.step+1);else pay();});
$('previous').addEventListener('click',()=>{if(d.step>0)move(d.step-1);});
document.addEventListener('click',ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.dataset.close){$(b.dataset.close).close();return;}
 if(b.dataset.table){const n=Number(b.dataset.table);if(!ready||checkoutFlow.operation||!tables.some(t=>t.number===n&&t.status==='available'))return;d.table=n;d.terms=false;error('');document.querySelectorAll('[data-table]').forEach(btn=>{btn.classList.toggle('selected',Number(btn.dataset.table)===n);btn.setAttribute('aria-pressed',String(Number(btn.dataset.table)===n));});updateSelection();updateSummary();persist();if($('map-dialog').open)$('map-dialog').close();}
 if(b.dataset.memberId&&b.dataset.memberIndex!==undefined){
  const i=Number(b.dataset.memberIndex),p=d.members[i];
  if(!p)return;
  p.memberId=b.dataset.memberId;p.memberName=b.dataset.memberName||'';p.action=b.dataset.memberAction||'';
  p.firstName='';p.lastName='';d.terms=false;error('');render();return;
 }
 if(b.dataset.memberClear!==undefined){
  const i=Number(b.dataset.memberClear),p=d.members[i];
  if(!p)return;
  p.memberId='';p.memberName='';p.action='';p.firstName='';p.lastName='';d.terms=false;render();return;
 }
 if(b.dataset.zone){zone=b.dataset.zone;renderTables();}
 if(b.dataset.step!==undefined&&Number(b.dataset.step)<=d.step)move(Number(b.dataset.step));
 if(b.dataset.edit!==undefined)move(Number(b.dataset.edit));
 if(b.dataset.quantity){setQuantity(d,Number(b.dataset.quantity));render();}
 if(b.dataset.guests){setGuests(d,d.guests+Number(b.dataset.guests));render();}
 if(b.dataset.action==='zoom'){$('large-map').innerHTML=mapHTML();$('map-dialog').showModal();}
 if(b.dataset.action==='expand-all'){const cards=[...document.querySelectorAll('.attendee')],all=cards.every(x=>x.open);cards.forEach(x=>x.open=!all);b.textContent=all?'Abrir todos':'Cerrar todos';}
 if(b.dataset.action==='clear-draft'){d.remember=false;storage.removeItem(DRAFT_KEY);render();showNotice('Borrador guardado eliminado','<p>La copia guardada se elimin&oacute;. Los datos que editas siguen visibles hasta cerrar o recargar la p&aacute;gina.</p>');}
});
$('reservation-form').addEventListener('input',ev=>{
 const el=ev.target,id=el.id;if(id.startsWith('r-')){d.responsible[id.slice(2)]=el.value;syncResponsible(d);d.terms=false;}
 const memberSearch=id.match(/^m-(\d+)-search$/);
 if(memberSearch){queueMemberSearch(Number(memberSearch[1]),el.value);d.terms=false;el.removeAttribute('aria-invalid');if($(id+'-error'))$(id+'-error').hidden=true;persist();return;}
 const m=id.match(/^([mg])-(\d+)-(\w+)$/);if(m){(m[1]==='m'?d.members:d.visitors)[Number(m[2])][m[3]]=el.value;d.terms=false;updateAttendeeProgress();}
 if(id==='accepted-terms')d.terms=el.checked;el.removeAttribute('aria-invalid');if($(id+'-error'))$(id+'-error').hidden=true;persist();
});
$('reservation-form').addEventListener('change',ev=>{
 const el=ev.target;if(el.id==='responsible-attends'){d.responsibleAttends=el.checked;d.terms=false;render();}if(el.id==='responsible-type'){d.responsibleType=el.value;d.terms=false;render();}if(el.id==='remember-draft'){d.remember=el.checked;persist();}
});
$('mode-banner').hidden=false;$('mode-banner').innerHTML=CONFIG.preview?'<strong>VISTA PREVIA 2026</strong> &middot; Disponibilidad de demostraci&oacute;n. No guarda reservas ni realiza cobros.':'Consultando la disponibilidad y el modo de pagos...';
render();
async function catalog(){
 try{
  const c=await liveApi('catalog');
  if(c?.event?.environment!=='live'||!Array.isArray(c.tables)||c.tables.length!==45)throw Error('El servidor no corresponde al entorno de produccion esperado.');
  mode='live';
  prices={...EVENT,memberPrice:Number(c.event.memberPrice),guestPrice:Number(c.event.guestPrice)};
  tables=TABLES.map(t=>({...t,...c.tables.find(s=>s.number===t.number)}));
  ready=true;
  salesEnabled=c.event.enabled===true;
  $('mode-banner').innerHTML=salesEnabled
   ?'<strong>RESERVAS HABILITADAS</strong> &middot; Los pagos se procesan en produccion.'
   :'<strong>PRELANZAMIENTO</strong> &middot; Puedes revisar el formulario completo. El pago permanecera bloqueado hasta la apertura oficial.';
  if(d.table&&!tables.some(t=>t.number===d.table&&t.status==='available')&&!checkoutFlow.operation){
   d.table=null;d.step=0;render();error('La mesa seleccionada ya no esta disponible. Elige otra antes de continuar.');paintPendingOperation();return;
  }
  if(d.step===0)render();
  else{
   updateSummary();
   $('next').innerHTML=d.step===3?(salesEnabled?'Continuar al pago':'Pago aun no habilitado'):'Continuar <span aria-hidden="true">&#8594;</span>';
   $('next').disabled=busy||!ready||!!checkoutFlow.operation||(d.step===3&&!salesEnabled);
  }
  paintPendingOperation();
 }catch{ready=false;salesEnabled=false;$('mode-banner').textContent='No se pudo verificar la disponibilidad. No se puede iniciar otro pago.';$('next').disabled=true;}
}
paintPendingOperation();
if(!CONFIG.preview){catalog();setInterval(()=>{if(!document.hidden&&!busy)catalog();},30000);}
