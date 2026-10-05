import {CONFIG} from './config.js?v=production-status-20261003-3';
import {money,escapeHTML as escape,storage} from './domain.js?v=production-status-20261003-3';
export const RESULT_BUILD='production-status-20261003-4';
const terminal=new Set(['confirmed','declined','expired','cancelled','review']);
const states={
 confirmed:['Pago de prueba confirmado','El servidor verific\u00f3 el pago de prueba y confirm\u00f3 tu mesa. No necesitas pagar nuevamente. Esta simulaci\u00f3n no es un abono bancario real.'],
 held:['Solicitud creada','Todav\u00eda no hay un pago aprobado.'],
 opening:['Preparando el pago','La solicitud est\u00e1 en preparaci\u00f3n. No inicies un pago diferente.'],
 payment_pending:['Verificando el pago','Consultamos autom\u00e1ticamente esta reserva. La pantalla cambiar\u00e1 cuando el servidor verifique el resultado. No repitas el pago.'],
 declined:['Pago rechazado','El servidor verific\u00f3 el rechazo. Esta solicitud no confirma una mesa.'],
 expired:['Solicitud vencida','Esta solicitud no confirma una reserva.'],
 cancelled:['Solicitud cancelada','Esta solicitud no confirma una reserva.'],
 review:['Revisi\u00f3n necesaria','Eventos debe revisar esta operaci\u00f3n. No repitas el pago ni asumas que la mesa est\u00e1 confirmada.'],
};
// Only the server determines state: never trust a status in the URL or Checkout.
export async function readStatus(id,token,fetchImpl=fetch,live=false){
 const url=new URL(live?CONFIG.liveApiUrl:CONFIG.apiUrl);url.searchParams.set('_status_read',String(Date.now()));
 const r=await fetchImpl(url.href,{method:'POST',cache:'no-store',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json',apikey:CONFIG.anonKey},body:JSON.stringify({action:'status',id,token}),signal:AbortSignal.timeout(10000)});
 const v=await r.json().catch(()=>null);
 if(!r.ok){const e=new Error(r.status===401?'No se pudo verificar tu acceso. Vuelve desde el formulario en esta misma pesta\u00f1a.':'No pudimos consultar el estado. Reintentaremos sin crear otro pago.');e.httpStatus=r.status;throw e;}
 if(!v||v.id!==id||!Object.hasOwn(states,v.status)||typeof v.invoice!=='string'||!Number.isSafeInteger(v.amount)||!Number.isInteger(v.table_number))throw Error('La consulta no devolvi\u00f3 un estado verificable para esta reserva.');
 return v;
}
export function startResultPage({doc=document,win=window,store=storage,request=readStatus,interval=3000}={}){
 const el=id=>doc.getElementById(id),id=new URL(win.location.href).searchParams.get('id');
 let ticket;try{ticket=JSON.parse(store.getItem('bn2026-last-payment')||'null');}catch{}
 let timer=null,inFlight=null,last=null,stopped=false,disposed=false,checks=0;
 const button=el('check-status'),symbol=doc.querySelector('.status-symbol'),card=doc.querySelector('.result-container .form-card');
 const note=text=>{if(el('status-progress'))el('status-progress').textContent=text;};
 const cancelTimer=()=>{if(timer!==null){win.clearTimeout(timer);timer=null;}};
 function schedule(delay=interval){cancelTimer();if(!disposed&&!stopped&&!doc.hidden&&win.navigator.onLine!==false)timer=win.setTimeout(()=>void check(),delay);}
 function draw(v){
  if(last?.status==='confirmed'&&v.status!=='confirmed')return;
  last=v;
  const live=ticket.live===true;
  if(live&&ticket.source==='production-smoke'&&v.status==='confirmed'){
   el('result-title').textContent='Pago real de validación confirmado';
   el('result-message').textContent='El servidor verificó el cobro real controlado. Este cargo corresponde a una transacción de producción de validación.';
  }else if(live&&ticket.source==='production-smoke'&&v.status==='declined'){
   el('result-title').textContent='Pago real rechazado';
   el('result-message').textContent='El servidor verificó el rechazo del cobro controlado. No se confirmó la mesa.';
  }else if(live&&ticket.source==='production-smoke'&&v.status==='cancelled'){
   el('result-title').textContent='Pago real cancelado';
   el('result-message').textContent='La prueba real fue cancelada. No se confirmó la mesa.';
  }else if(live&&v.status==='confirmed'){
   el('result-title').textContent='Pago confirmado';
   el('result-message').textContent='El servidor verificó el pago con ePayco y confirmó tu mesa. No necesitas pagar nuevamente.';
  }else if(live&&v.status==='declined'){
   el('result-title').textContent='Pago rechazado';
   el('result-message').textContent='El servidor verificó el rechazo del pago. La mesa no quedó confirmada.';
  }else if(live&&v.status==='cancelled'){
   el('result-title').textContent='Pago cancelado';
   el('result-message').textContent='El pago fue cancelado. La mesa no quedó confirmada.';
  }else{
   el('result-title').textContent=states[v.status][0];el('result-message').textContent=states[v.status][1];
  }
  card?.setAttribute('data-payment-state',v.status);
  if(symbol){symbol.textContent=v.status==='confirmed'?'\u2713':v.status==='declined'?'\u00d7':'\u25c7';symbol.setAttribute('data-state',v.status);}
  el('result-details').innerHTML=`<div class="review-block" style="margin-top:20px"><p>Referencia: <strong>${escape(v.invoice)}</strong></p><p>${live?'Mesa':'Mesa de ensayo'}: ${v.table_number}</p><p>Valor: ${money(v.amount)}</p></div>`;
  store.setItem('bn2026-last-payment',JSON.stringify({...ticket,status:v.status}));
  note((terminal.has(v.status)?'Estado verificado':'\u00daltima consulta')+' a las '+new Date().toLocaleTimeString('es-CO')+'.');
  stopped=terminal.has(v.status);if(stopped)cancelTimer();
 }
 async function check(){
  if(disposed)return;if(inFlight)return inFlight;cancelTimer();
  if(win.navigator.onLine===false){note('Sin conexi\u00f3n. Consultaremos al recuperar internet; no repitas el pago.');return;}
  button.disabled=true;button.textContent='Consultando...';
  inFlight=(async()=>{
   try{const v=await request(id,ticket.token,fetch,ticket.live===true);if(!disposed)draw(v);}
   catch(e){if(disposed)return;note(e.httpStatus===401?e.message:'No pudimos actualizar ahora. Reintentaremos autom\u00e1ticamente; no vuelvas a pagar.');if(e.httpStatus===401)stopped=true;}
   finally{inFlight=null;if(!disposed){button.disabled=false;button.textContent=last?.status==='confirmed'?'Comprobar estado':'Actualizar estado';checks++;schedule(checks>200?10000:interval);}}
  })();return inFlight;
 }
 const resume=()=>{if(!disposed&&!doc.hidden){if(!terminal.has(last?.status))stopped=false;void check();}};
 const visibility=()=>{if(doc.hidden)cancelTimer();else resume();};
 if(!ticket||ticket.id!==id||typeof ticket.token!=='string'||ticket.token.length<64||ticket.token.length>160){el('result-title').textContent='Necesitamos verificar tu solicitud';el('result-message').textContent='Vuelve desde el formulario en la misma pesta\u00f1a donde iniciaste el pago. Una referencia por s\u00ed sola no permite consultar datos privados.';button.disabled=true;return {check:async()=>{},dispose:()=>{}};}
 if(CONFIG.preview&&ticket.lab!==true){el('result-title').textContent='Vista previa sin pagos';button.disabled=true;return {check:async()=>{},dispose:()=>{}};}
 if(ticket.live===true&&ticket.source==='production-smoke')doc.querySelectorAll('a[href="index.html"]').forEach(a=>{a.href='admin.html';if(a.classList.contains('text-button'))a.textContent='Volver a Administración';});
 else if(ticket.live===true)doc.querySelectorAll('a[href="index.html"]').forEach(a=>{a.href='index.html';if(a.classList.contains('text-button'))a.textContent='Volver al formulario';});
 else if(ticket.lab===true)doc.querySelectorAll('a[href="index.html"]').forEach(a=>{a.href=ticket.source==='form'?'index.html':'pruebas-pago.html';if(a.classList.contains('text-button'))a.textContent=ticket.source==='form'?'Volver al formulario':'Volver al laboratorio';});
 button.addEventListener('click',resume);doc.addEventListener('visibilitychange',visibility);
 for(const event of ['pageshow','focus','online'])win.addEventListener(event,resume);
 void check();
 return {check,dispose(){disposed=true;cancelTimer();button.removeEventListener('click',resume);doc.removeEventListener('visibilitychange',visibility);for(const event of ['pageshow','focus','online'])win.removeEventListener(event,resume);}};
}
if(typeof document!=='undefined'&&document.getElementById('result-title'))startResultPage();
