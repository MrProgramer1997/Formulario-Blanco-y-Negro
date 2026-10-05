import {icon} from './icons.js';
import {CONFIG,TABLES,TEST_CASES} from './config.js';
import {money,escapeHTML as e,csvCell,requestUUID,storage} from './domain.js?v=member-directory-20261004-1';
import {api,liveApi,login,logout,session,confirmationStatus,openCheckout} from './api.js?v=member-directory-20261004-1';
const $=id=>document.getElementById(id);
let demo=false,tab='dashboard',query='',data=null,selectedTest='T1500',confirmationData=null,liveData=null,liveAmount=1000,liveTable=45;
const returnParams=new URLSearchParams(location.search);
const returnCase=TEST_CASES.some(x=>x.code===returnParams.get('test_case'))?returnParams.get('test_case'):'T1500';
const stateLabels={confirmed:'Confirmada',payment_pending:'En pago',held:'Retenida',opening:'Preparando',expired:'Vencida',declined:'Rechazada',review:'Por revisar',cancelled:'Cancelada'};
const xml=v=>String(v??'').replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
function downloadGuestExcel(rows){
 const headers=['Mesa','Referencia','Responsable','Nombres','Apellidos','Tipo documento','Documento','Correo','Celular','Estado'];
 const matrix=[headers,...rows.map(r=>[r.table,r.invoice,r.responsible,r.firstName,r.lastName,r.docType,r.document,r.email,r.phone,'Confirmada'])];
 const body=matrix.map(row=>'<Row>'+row.map(v=>'<Cell><Data ss:Type="String">'+xml(v)+'</Data></Cell>').join('')+'</Row>').join('');
 const workbook='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
  +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
  +'<Worksheet ss:Name="Invitados"><Table>'+body+'</Table></Worksheet></Workbook>';
 const blob=new Blob([workbook],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='invitados-blanco-negro-2026.xls';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showLogin(message=''){
 $('logout').hidden=true;
 $('admin-root').innerHTML=`<section class="form-card login-card"><div class="login-emblem">${icon("lock")}</div><span class="overline">ACCESO PRIVADO</span><h1>Administraci&oacute;n de Eventos</h1><p class="subtext">Reservas, mesas, asistentes y seguimiento de pagos en un solo lugar.</p>${message?`<div class="error-box" role="alert">${e(message)}</div>`:''}<form id="login-form"><div class="fields"><div class="field"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" value="EventosyServicios" required></div><div class="field"><label for="password">Contrase&ntilde;a</label><input id="password" name="password" type="password" autocomplete="current-password" required></div></div><p id="login-error" class="error-box" role="alert" hidden></p><button type="submit" class="button primary full" id="login-button">Ingresar</button></form></section>`;
 $('login-form').addEventListener('submit',async ev=>{ev.preventDefault();$('login-button').disabled=true;try{await login($('username').value,$('password').value);await load();}catch(err){$('login-error').textContent=err.message;$('login-error').hidden=false;}finally{if($('login-button'))$('login-button').disabled=false;}});

}
function summary(){
 const confirmed=data.reservations.filter(r=>r.status==='confirmed'),held=data.reservations.filter(r=>['held','opening','payment_pending'].includes(r.status));
 return {confirmed:confirmed.length,held:held.length,blocked:data.tables.filter(t=>t.status==='blocked').length,available:data.tables.filter(t=>t.status==='available').length,booked:confirmed.reduce((n,r)=>n+r.quantity,0),members:confirmed.reduce((n,r)=>n+r.member_count,0),guests:confirmed.reduce((n,r)=>n+r.guest_count,0),revenue:confirmed.filter(r=>r.payment_status==='approved').reduce((n,r)=>n+(r.amount_paid??r.amount),0),pending:held.reduce((n,r)=>n+r.amount,0)};
}
function kpi(label,value,note,featured=false,kind="grid"){return `<article class="kpi ${featured?'featured':''}"><div class="kpi-top"><small>${label}</small><span class="kpi-icon">${icon(kind)}</span></div><strong>${value}</strong><p>${note}</p></article>`;}
function dashboard(){const s=summary();return `<div class="kpi-grid">${kpi('Reservas confirmadas',s.confirmed,`${s.booked} asistentes confirmados`,false,'check')}${kpi('Mesas disponibles',s.available,`${s.blocked} bloqueadas por Eventos`)}${kpi('Solicitudes en pago',s.held,'No se cuentan como venta confirmada',false,'clock')}${kpi('Recaudo confirmado',money(s.revenue),'Pagos verificados del evento',true,'credit')}</div><div class="admin-two-col"><section class="admin-card"><div class="admin-card-title"><span class="section-index">${icon("grid")}</span><h2>Ocupaci&oacute;n de mesas</h2><button type="button" class="text-button" data-tab="tables">Ver mesas ${icon("arrow")}</button></div><p>Disponibilidad exclusiva del evento seleccionado, sin mezclar el hist&oacute;rico.</p><div class="occupancy-track"><span class="confirmed" style="width:${s.confirmed/data.tables.length*100}%"></span><span class="held" style="width:${s.held/data.tables.length*100}%"></span></div><div class="occupancy-legend"><span><i class="dot"></i> ${s.confirmed} confirmadas</span><span><i class="dot held"></i> ${s.held} en pago</span><span>${s.available} disponibles</span><span>${s.blocked} bloqueadas</span></div><div class="metric-list"><div><span>Cupos en mesas totalmente disponibles</span><strong>${s.available*10}</strong></div><div><span>Puestos confirmados de socios / corporados</span><strong>${s.members}</strong></div><div><span>Puestos confirmados de invitados</span><strong>${s.guests}</strong></div></div><p class="small muted" style="margin-top:16px">Los puestos sobrantes en una mesa confirmada no se ofrecen autom&aacute;ticamente a otro grupo.</p></section><section class="admin-card"><div class="admin-card-title"><span class="section-index">${icon("credit")}</span><h2>Control de pagos</h2></div><p>Una solicitud pendiente no confirma una mesa.</p><div class="metric-list"><div><span>Valor de solicitudes pendientes</span><strong>${money(s.pending)}</strong></div><div><span>Rechazadas / vencidas</span><strong>${data.reservations.filter(r=>['declined','expired'].includes(r.status)).length}</strong></div><div><span>Incidencias por revisar</span><strong>${data.reservations.filter(r=>r.status==='review').length}</strong></div></div><div class="notice-box">Panel operativo del evento en <strong>PRODUCCI&Oacute;N</strong>. El laboratorio no se muestra en esta vista.</div></section></div>`;}
function reservationRows(){const rows=data.reservations.filter(r=>[r.invoice,r.responsible_name,r.table_number,stateLabels[r.status]].join(' ').toLowerCase().includes(query.toLowerCase()));return rows.length?rows.map(r=>`<tr><td>${e(r.invoice)}</td><td>${e(r.responsible_name)}</td><td>${r.table_number}</td><td>${r.quantity}</td><td><span class="badge ${e(r.status)}">${e(r.source==='manual'&&r.status==='confirmed'?'Confirmada manual':stateLabels[r.status]||r.status)}</span></td><td>${money(r.amount)}</td><td><button type="button" class="text-button" data-detail="${e(r.id)}">Ver detalle</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No hay reservas que coincidan con la b&uacute;squeda.</td></tr>';}
function reservations(){return `<section class="admin-card"><div class="table-toolbar"><div><h2>Reservas y solicitudes</h2><p class="small muted">${demo?'Registros ficticios de demostraci&oacute;n.':'Hasta 500 registros. No incluye el hist&oacute;rico anterior.'}</p></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="button secondary" id="export-guests">Exportar invitados Excel</button><button type="button" class="button secondary" id="export-csv">Exportar reservas CSV</button></div></div><div class="table-toolbar"><input type="search" class="search-input" id="reservation-search" placeholder="Buscar por responsable, mesa o referencia" aria-label="Buscar reservas" value="${e(query)}"></div><div class="table-scroll"><table class="data-table"><thead><tr><th>REFERENCIA</th><th>RESPONSABLE</th><th>MESA</th><th>PERSONAS</th><th>ESTADO</th><th>VALOR</th><th></th></tr></thead><tbody id="reservation-rows">${reservationRows()}</tbody></table></div></section>`;}

function manualReservationForm(t){
 return `<form id="manual-reservation-form" style="margin-top:18px">
  <div class="notice-box"><strong>Reserva administrativa completa</strong><p>Registra el responsable y todos los asistentes. No crea un cobro ePayco.</p></div>
  <div class="fields">
   <div class="field"><label for="mr-first">Nombres del responsable</label><input id="mr-first" required maxlength="80"></div>
   <div class="field"><label for="mr-last">Apellidos del responsable</label><input id="mr-last" required maxlength="80"></div>
   <div class="field"><label for="mr-email">Correo del responsable</label><input id="mr-email" type="email" required maxlength="254"></div>
   <div class="field"><label for="mr-phone">Celular del responsable</label><input id="mr-phone" required maxlength="25"></div>
   <div class="field"><label for="mr-quantity">Personas</label><select id="mr-quantity"><option>8</option><option>9</option><option>10</option></select></div>
   <div class="field"><label for="mr-guests">Invitados</label><select id="mr-guests"></select></div>
  </div>
  <div id="mr-attendees"></div>
  <div class="field"><label for="mr-note">Observaci&oacute;n interna</label><input id="mr-note" maxlength="300" placeholder="Cortesía, convenio, autorización, etc."></div>
  <button type="submit" class="button primary">Guardar reserva administrativa</button>
 </form>`;
}
function renderManualAttendees(){
 const container=$('mr-attendees');if(!container)return;
 const qty=Number($('mr-quantity').value),guestSelect=$('mr-guests'),previous=Number(guestSelect.value||0);
 guestSelect.innerHTML=Array.from({length:qty+1},(_,i)=>`<option value="${i}" ${i===Math.min(previous,qty)?'selected':''}>${i}</option>`).join('');
 const guests=Number(guestSelect.value),members=qty-guests;
 let html='<h3>Socios / corporados · '+members+'</h3>';
 for(let i=0;i<members;i++)html+=`<div class="fields" data-mr-person="member"><div class="field"><label>Nombres</label><input data-k="firstName" required maxlength="80"></div><div class="field"><label>Apellidos</label><input data-k="lastName" required maxlength="80"></div><div class="field wide"><label>Número de acción o cupo</label><input data-k="action" required maxlength="40"></div></div>`;
 if(guests)html+='<h3>Invitados · '+guests+'</h3>';
 for(let i=0;i<guests;i++)html+=`<div class="fields" data-mr-person="guest"><div class="field"><label>Nombres</label><input data-k="firstName" required maxlength="80"></div><div class="field"><label>Apellidos</label><input data-k="lastName" required maxlength="80"></div><div class="field"><label>Tipo de documento</label><select data-k="docType"><option>CC</option><option>CE</option><option>PAS</option><option>OTRO</option></select></div><div class="field"><label>Número de documento</label><input data-k="document" required maxlength="30"></div><div class="field"><label>Correo</label><input data-k="email" type="email" required maxlength="254"></div><div class="field"><label>Celular</label><input data-k="phone" required maxlength="25"></div></div>`;
 container.innerHTML=html;
}
function bindManualReservation(t){
 $('mr-quantity')?.addEventListener('change',renderManualAttendees);
 $('mr-guests')?.addEventListener('change',renderManualAttendees);
 renderManualAttendees();
 $('manual-reservation-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   const attendees=[...form.querySelectorAll('[data-mr-person]')].map(row=>{
    const obj={type:row.dataset.mrPerson};
    row.querySelectorAll('[data-k]').forEach(el=>obj[el.dataset.k]=el.value.trim());
    return obj;
   });
   const payload={
    action:'manual_reservation',
    table:t.number,
    quantity:Number($('mr-quantity').value),
    responsible:{firstName:$('mr-first').value.trim(),lastName:$('mr-last').value.trim(),email:$('mr-email').value.trim(),phone:$('mr-phone').value.trim()},
    attendees,
    note:$('mr-note').value.trim(),
    acceptedTerms:true
   };
   await api('manual_reservation',payload,true);
   $('admin-dialog').close();await load();
  }catch(err){button.disabled=false;detail('No se pudo guardar la reserva',`<p>${e(err.message)}</p>`);}
 });
}
function tablePanel(){return `<section class="admin-card"><h2>Las 45 mesas del plano 2026</h2><p>Eventos puede bloquear una mesa disponible para una reserva administrativa. Una mesa con pago o reserva activa no se puede modificar manualmente.</p><div class="legend" style="margin:18px 0"><span><i class="dot"></i> Disponible</span><span><i class="dot held"></i> En pago</span><span><i class="dot occupied"></i> Confirmada</span><span><i class="dot" style="background:#d6aa58"></i> Bloqueada</span></div>${['Rialto','Lobby'].map(zone=>`<h3>${zone}</h3><div class="table-grid">${data.tables.filter(t=>t.zone===zone).map(t=>`<button type="button" class="table-cell ${t.status}" data-table-detail="${t.number}" title="Mesa ${t.number}">${t.number}<small>${t.status==='available'?'Libre':t.status==='held'?'En pago':t.status==='blocked'?'Bloqueada':'Reservada'}</small></button>`).join('')}</div>`).join('')}</section>`;}
function tests(){return `<section class="admin-card"><h2>Laboratorio de pagos</h2><p>Solo administradores. Usa mesas y reservas de ensayo separadas del evento real.</p><div class="test-grid">${TEST_CASES.map(t=>`<button type="button" class="test-option ${t.code===selectedTest?'active':''}" data-test="${t.code}"><small>PRUEBA ${t.code.slice(1)}</small><strong>${money(t.amount)}</strong></button>`).join('')}</div><div class="notice-box"><strong>No utiliza dinero real.</strong> El total de ensayo lo impone el servidor a partir del caso elegido. Cambiar el importe en el navegador no cambia el cobro.</div><a class="button primary" href="index.html?test_case=${selectedTest}">Abrir formulario de ensayo &#8599;</a><div class="connection-list"><div><span>Modo del servidor</span><strong>${demo?'Demostraci&oacute;n':'Pruebas'}</strong></div><div><span>Llaves de ePayco</span><strong>${demo?'Sin comprobar':data.settings.keysConfigured?'Configuradas':'Pendientes'}</strong></div><div><span>Datos de tarjetas en el formulario</span><strong>No se solicitan</strong></div><div><span>Activaci&oacute;n de cobros reales</span><strong>Deshabilitada</strong></div></div></section>`;}
function production(){
 const d=liveData;
 if(!d)return `<section class="admin-card"><h2>Producci&oacute;n controlada</h2><p>Entorno separado del laboratorio. El formulario p&uacute;blico sigue cerrado.</p><button type="button" class="button secondary" id="load-live-status">Verificar configuraci&oacute;n de producci&oacute;n</button><p id="live-error"></p></section>`;
 const available=(d.tables||[]).filter(t=>t.status==='available');
 if(!available.some(t=>t.number===liveTable)&&available.length)liveTable=available[0].number;
 const ready=d.keysConfigured===true&&d.smokeEnabled===true&&d.publicEnabled===false;
 return `<section class="admin-card"><h2>Producci&oacute;n controlada</h2>
  <div class="notice-box"><strong>Este entorno usa dinero real.</strong><p>Solo administradores. El evento p&uacute;blico permanece deshabilitado hasta terminar estas pruebas.</p></div>
  <div class="connection-list">
   <div><span>Llaves reales ePayco</span><strong>${d.keysConfigured?'Configuradas':'Pendientes'}</strong></div>
   <div><span>Prueba real controlada</span><strong>${d.smokeEnabled?'Habilitada':'Deshabilitada'}</strong></div>
   <div><span>Formulario p&uacute;blico</span><strong>${d.publicEnabled?'ACTIVO - revisar':'Cerrado'}</strong></div>
  </div>
  <h3>Importe real de validaci&oacute;n</h3>
  <div class="test-grid">${[1000,1500,3000].map(v=>`<button type="button" class="test-option ${liveAmount===v?'active':''}" data-live-amount="${v}"><small>COBRO REAL</small><strong>${money(v)}</strong></button>`).join('')}</div>
  <div class="field" style="margin-top:18px"><label for="live-table">Mesa aislada para la prueba</label><select id="live-table">${available.map(t=>`<option value="${t.number}" ${t.number===liveTable?'selected':''}>Mesa ${t.number} · ${t.zone}</option>`).join('')}</select><small>La reserva de humo queda separada con origen SMOKE y no habilita ventas p&uacute;blicas.</small></div>
  <button type="button" class="button primary" id="start-live-smoke" ${ready&&available.length?'':'disabled'}>Iniciar cobro real controlado de ${money(liveAmount)}</button>
  <p id="live-error" class="small"></p>
  <h3 style="margin-top:26px">Pruebas reales recientes</h3>
  <div class="table-scroll"><table class="data-table"><thead><tr><th>REFERENCIA</th><th>MESA</th><th>VALOR</th><th>ESTADO</th><th>FECHA</th></tr></thead><tbody>${(d.rows||[]).length?(d.rows||[]).map(x=>`<tr><td>${e(x.invoice)}</td><td>${x.table_number}</td><td>${money(x.amount)}</td><td>${e(stateLabels[x.status]||x.status)}</td><td>${e(String(x.created_at).slice(0,16).replace('T',' '))}</td></tr>`).join(''):'<tr><td colspan="5">A&uacute;n no hay pruebas reales.</td></tr>'}</tbody></table></div>
 </section>`;
}
async function loadLive(){
 try{liveData=await liveApi('smoke_status',{},true);render();}
 catch(err){const el=$('live-error');if(el)el.textContent=err.message;else detail('Producci&oacute;n',`<p>${e(err.message)}</p>`);}
}
async function startLiveSmoke(){
 const button=$('start-live-smoke');if(button)button.disabled=true;
 try{
  const table=Number($('live-table')?.value||liveTable);liveTable=table;
  const requestId=requestUUID(),statusToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  const result=await liveApi('smoke_checkout',{table,amount:liveAmount,requestId,statusToken},true);
  storage.setItem('bn2026-last-payment',JSON.stringify({id:result.reservationId,token:statusToken,live:true,source:'production-smoke'}));
  await openCheckout(result.sessionId,false,()=>{location.href='resultado.html?id='+encodeURIComponent(result.reservationId);});
 }catch(err){const el=$('live-error');if(el)el.textContent=err.message;else detail('No se pudo iniciar la prueba real',`<p>${e(err.message)}</p>`);if(button)button.disabled=false;}
}
function history(){return `<section class="admin-card"><h2>Hist&oacute;rico anterior</h2><p>La actualizaci&oacute;n no borra ni renombra las tablas originales.</p>${demo?'<div class="notice-box">La demostraci&oacute;n no consulta reservas privadas anteriores.</div>':`<div class="notice-box">${data.legacyCount} registros conservados en la tabla original. La clasificaci&oacute;n por evento debe revisarse antes de una migraci&oacute;n definitiva; la fecha de creaci&oacute;n por s&iacute; sola no demuestra a qu&eacute; evento pertenece una reserva.</div><button class="button secondary" type="button" id="load-history">Consultar registros hist&oacute;ricos</button><div id="history-results"></div>`}</section>`;}
function confirmations(){
 const q=confirmationData;
 return '<section class="admin-card"><h2>Confirmacion automatica</h2><p>El servidor verifica ePayco despues de recibir la notificacion. No vuelve a cobrar y no depende de mantener esta pagina abierta.</p>'+(q?'<div class="notice-box"><strong>Programador: '+(q.scheduled===true?'Activo cada minuto':'No confirmado')+'</strong></div><div class="metric-list">'+[['En espera',q.waiting],['En proceso',q.processing],['Verificaciones terminadas',q.done],['Requieren revision',q.review]].map(([n,v])=>'<div><span>'+n+'</span><strong>'+Number(v||0)+'</strong></div>').join('')+'</div>':'<p>No se han consultado los contadores.</p>')+'<button type="button" class="button secondary" id="refresh-confirmations">Consultar cola</button><p id="confirmation-error" role="status"></p><p><a href="pruebas-pago.html#lab-maintenance">Sincronizacion manual y cambio de contrasena (solo soporte)</a></p><p class="small muted">Recibir una notificacion no significa que el pago este aprobado. Si se agotan los reintentos, el caso requiere revision.</p></section>';
}
function render(){
 $('logout').hidden=false;$('admin-banner').hidden=false;$('admin-banner').innerHTML=demo?'<strong>DEMOSTRACI&Oacute;N VISUAL</strong> &middot; Todos los registros y valores de este panel son ficticios.':'<strong>PRODUCCI&Oacute;N</strong> &middot; Reservas, mesas y pagos reales del evento.';
 $('admin-root').innerHTML=`<div class="admin-page"><div class="admin-heading"><div><span class="overline">EVENTOS Y SERVICIOS <span class="admin-heading-tag">CONTROL 2026</span></span><h1>Todo tu evento,<br>en un solo lugar.</h1><p>Fiesta Blanco y Negro &middot; 6 de noviembre de 2026</p></div><div class="admin-actions"><button type="button" class="button secondary" id="refresh-admin">Actualizar</button><a href="index.html" class="button primary">Ver formulario &#8599;</a></div></div><nav class="admin-tabs" aria-label="Secciones administrativas">${[['dashboard','Resumen','grid'],['reservations','Reservas','list'],['tables','Mesas','people'],['history','Hist&oacute;rico','history']].map(([id,name,i])=>`<button type="button" data-tab="${id}" class="${tab===id?'active':''}" ${tab===id?'aria-current="page"':''}>${icon(i)}${name}</button>`).join('')}</nav><div id="admin-content">${({dashboard,reservations,tables:tablePanel,tests,production,confirmations,history}[tab])()}</div></div>`;
 $('refresh-confirmations')?.addEventListener('click',async()=>{try{confirmationData=await confirmationStatus();render();}catch(err){$('confirmation-error').textContent=err.message;}});
 $('refresh-admin').addEventListener('click',()=>demo?render():load());
 $('reservation-search')?.addEventListener('input',ev=>{query=ev.target.value;$('reservation-rows').innerHTML=reservationRows();});
 $('export-guests')?.addEventListener('click',async()=>{
  const button=$('export-guests');button.disabled=true;button.textContent='Generando Excel...';
  try{const out=await api('export_guests',{},true);downloadGuestExcel(Array.isArray(out.rows)?out.rows:[]);}
  catch(err){detail('No se pudo exportar',`<p>${e(err.message)}</p>`);}
  finally{if($('export-guests')){$('export-guests').disabled=false;$('export-guests').textContent='Exportar invitados Excel';}}
 });
 $('export-csv')?.addEventListener('click',()=>{const lines=[['Referencia','Responsable','Mesa','Personas','Socios','Invitados','Estado','Valor COP'],...data.reservations.map(r=>[r.invoice,r.responsible_name,r.table_number,r.quantity,r.member_count,r.guest_count,stateLabels[r.status],r.amount])];const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(demo?'DEMOSTRACION-':'PRODUCCION-')+'reservas-2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('load-live-status')?.addEventListener('click',loadLive);
 $('start-live-smoke')?.addEventListener('click',startLiveSmoke);
 $('live-table')?.addEventListener('change',ev=>{liveTable=Number(ev.target.value);});
 document.querySelectorAll('[data-live-amount]').forEach(b=>b.addEventListener('click',()=>{liveAmount=Number(b.dataset.liveAmount);render();}));
 $('load-history')?.addEventListener('click',async()=>{try{const h=await api('history',{},true);$('history-results').innerHTML=`<div class="table-scroll" style="margin-top:20px"><table class="data-table"><thead><tr><th>REGISTRO</th><th>RESPONSABLE</th><th>MESA</th><th>CANTIDAD</th><th>ESTADO ORIGINAL</th><th>CREACI&Oacute;N</th></tr></thead><tbody>${h.rows.map(r=>`<tr><td>${e(r.id.slice(0,8))}</td><td>${e(r.responsable)}</td><td>${r.mesa_id}</td><td>${r.cantidad}</td><td>${e(r.estado)}</td><td>${e(r.created_at.slice(0,10))}</td></tr>`).join('')}</tbody></table></div>`;}catch(err){$('history-results').textContent=err.message;}});
}
async function load(){try{data=await api('admin',{},true);if(data.settings?.mode!=='live')throw Error('El administrador no corresponde al entorno de produccion.');demo=false;if(returnParams.get('return')==='form'){location.replace('index.html');return;}render();}catch(err){showLogin(err.message);}}
function detail(title,body){$('admin-dialog-title').textContent=title;$('admin-dialog-body').innerHTML=body;$('admin-dialog').showModal();}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.dataset.tab){tab=b.dataset.tab;render();if(tab==='production'&&!liveData)void loadLive();}
 if(b.dataset.test){selectedTest=b.dataset.test;render();}
 if(b.dataset.detail){
  const r=data.reservations.find(x=>x.id===b.dataset.detail);if(!r)return;
  let people=[];if(!demo){try{people=(await api('detail',{id:r.id},true)).attendees;}catch(err){detail('No se pudo consultar',`<p>${e(err.message)}</p>`);return;}}
  const payment=r.payment_status==='approved'
    ?`<div class="notice-box"><strong>Pago verificado</strong><p>Referencia ePayco: ${e(r.provider_ref||'Registrada')} · ${money(r.amount_paid??r.amount)}</p></div>`
    :r.source==='manual'&&r.status==='confirmed'
      ?`<div class="notice-box"><strong>Pago externo pendiente de asociar</strong><p>Si pagaron mediante el enlace externo de ePayco, pega la referencia numérica para verificarla.</p></div><form id="external-payment-form"><div class="field"><label for="external-ref">Referencia ePayco</label><input id="external-ref" inputmode="numeric" pattern="[0-9]{1,14}" required placeholder="Ej. 388390340"></div><button type="submit" class="button primary">Verificar y asociar pago</button><p id="external-payment-error" class="small"></p></form>`
      :'';
  detail(`Mesa ${r.table_number}`,`<p><strong>${e(r.responsible_name)}</strong></p><p>${e(r.invoice)} &middot; ${stateLabels[r.status]}</p><p>${r.quantity} asistentes &middot; ${money(r.commercial_amount??r.amount)}</p>${payment}${demo?'<div class="notice-box">Registro ficticio. No contiene datos personales reales.</div>':`<div class="table-scroll"><table class="data-table"><tbody>${people.map(p=>`<tr><td>${e(p.first_name)} ${e(p.last_name)}</td><td>${e(p.kind==='member'?'Socio':'Invitado')}</td></tr>`).join('')}</tbody></table></div>`}`);
  $('external-payment-form')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const button=ev.currentTarget.querySelector('button');button.disabled=true;
    try{
      const reference=$('external-ref').value.trim();
      await liveApi('link_external_payment',{reservationId:r.id,reference},true);
      $('admin-dialog').close();await load();
    }catch(err){button.disabled=false;$('external-payment-error').textContent=err.message;}
  });
 }
 if(b.dataset.unblockTable){
  const number=Number(b.dataset.unblockTable);
  if(!confirm('¿Liberar la mesa '+number+' para que vuelva a estar disponible?'))return;
  b.disabled=true;
  try{await api('table_block',{table:number,blocked:false,label:'',note:''},true);$('admin-dialog').close();await load();}
  catch(err){b.disabled=false;detail('No se pudo liberar la mesa',`<p>${e(err.message)}</p>`);}
  return;
 }
 if(b.dataset.cancelManual){
  const id=b.dataset.cancelManual;
  if(!confirm('¿Cancelar esta reserva administrativa y liberar la mesa?'))return;
  b.disabled=true;
  try{await api('manual_cancel',{id},true);$('admin-dialog').close();await load();}
  catch(err){b.disabled=false;detail('No se pudo cancelar',`<p>${e(err.message)}</p>`);}
  return;
 }
 if(b.dataset.tableDetail){
  const t=data.tables.find(t=>t.number===Number(b.dataset.tableDetail));if(!t)return;
  const manual=data.reservations.find(r=>r.table_number===t.number&&r.status==='confirmed'&&r.source==='manual');
  const status=t.status==='available'?'Disponible':t.status==='held'?'En proceso de pago':t.status==='blocked'?'Bloqueada por Eventos':'Confirmada';
  let controls='';
  if(manual){
   const paid=manual.payment_status==='approved';
   controls=`<div class="notice-box"><strong>Reserva administrativa: ${e(manual.responsible_name)}</strong><p>${manual.quantity} asistentes. ${manual.admin_note?e(manual.admin_note):'Sin observación.'}</p>${paid?`<p><strong>Pago verificado: ${money(manual.amount_paid??manual.amount)}</strong>. Una cancelación debe revisarse antes de liberar la mesa.</p>`:''}</div>${paid?'':`<button type="button" class="button secondary" data-cancel-manual="${manual.id}">Cancelar reserva administrativa</button>`}`;
  }else if(t.status==='available'){
   controls=`<div class="admin-two-col" style="margin-top:18px"><div><h3>Bloqueo rápido</h3><form id="table-block-form"><div class="field"><label for="block-label">Bloquear para</label><input id="block-label" maxlength="100" required placeholder="Persona, grupo o cortesía"></div><div class="field"><label for="block-note">Observación</label><input id="block-note" maxlength="300"></div><button type="submit" class="button secondary">Bloquear mesa</button></form></div><div><h3>Reserva completa</h3><p class="small muted">Registra responsable y asistentes desde ahora.</p><button type="button" class="button primary" id="open-manual-reservation">Añadir integrantes</button></div></div>`;
  }else if(t.status==='blocked'){
   controls=`<div class="notice-box"><strong>${e(t.blocked_label||'Bloqueada por Eventos')}</strong>${t.blocked_note?`<p>${e(t.blocked_note)}</p>`:''}</div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="button primary" id="open-manual-reservation">Añadir integrantes y confirmar</button><button type="button" class="button secondary" data-unblock-table="${t.number}">Liberar mesa</button></div>`;
  }else{
   controls='<p class="muted small">Esta mesa tiene una reserva o pago activo y no puede modificarse manualmente.</p>';
  }
  detail(`Mesa ${t.number} · ${t.zone}`,`<p>Capacidad máxima: ${t.capacity} puestos.</p><p>Estado: ${status}.</p><div id="table-admin-controls">${controls}</div>`);
  $('table-block-form')?.addEventListener('submit',async event=>{
   event.preventDefault();
   const label=$('block-label').value.trim(),note=$('block-note').value.trim(),button=$('table-block-form').querySelector('button');
   button.disabled=true;
   try{await api('table_block',{table:t.number,blocked:true,label,note},true);$('admin-dialog').close();await load();}
   catch(err){button.disabled=false;detail('No se pudo bloquear la mesa',`<p>${e(err.message)}</p>`);}
  });
  $('open-manual-reservation')?.addEventListener('click',()=>{
   $('table-admin-controls').innerHTML=manualReservationForm(t);bindManualReservation(t);
  });
 }
});
$('close-detail').addEventListener('click',()=>$('admin-dialog').close());
$('logout').addEventListener('click',async()=>{if(!demo)await logout();demo=false;data=null;$('admin-banner').hidden=true;showLogin();});
if(session())load();else showLogin();
