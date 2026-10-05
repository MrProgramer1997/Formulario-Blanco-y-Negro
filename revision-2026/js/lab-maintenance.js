import {api,currentToken} from './api.js';
import {CONFIG} from './config.js';
import {storage,money} from './domain.js';

// Administrative operations reuse the existing tab session. No password or
// provider key is stored here. The server still verifies identity and role.
const workspace=document.getElementById('lab-workspace');
const webhook=CONFIG.apiUrl.replace(/\/bn2026-api$/, '/bn2026-webhook');
let loading=false, syncing=false, lastLoad=0;
const panel=document.createElement('section');
panel.className='form-card';panel.id='lab-maintenance';
panel.innerHTML=`<h2>Acceso y confirmacion</h2>
<p class="small muted">Estas operaciones utilizan tu sesion de administrador. No necesitas abrir programas en el computador.</p>
<details id="password-settings"><summary>Cambiar mi contrasena</summary>
<form id="password-change-form"><p class="small muted">Elige una contrasena nueva y guardala en tu gestor. Supabase puede solicitar reautenticacion segun la politica de seguridad.</p>
<div class="fields"><div class="field"><label for="new-password">Nueva contrasena (minimo 16 caracteres)</label><input id="new-password" type="password" autocomplete="new-password" minlength="16" maxlength="128" required></div>
<div class="field"><label for="repeat-password">Repite la contrasena</label><input id="repeat-password" type="password" autocomplete="new-password" minlength="16" maxlength="128" required></div></div>
<button type="submit" class="button secondary" id="save-password">Guardar nueva contrasena</button><p id="password-message" role="status" aria-live="polite"></p></form></details>
<hr>
<form id="reconcile-form"><h3>Sincronizar un intento con ePayco</h3>
<p class="small muted">Consulta el pago existente. No crea otra reserva ni realiza un nuevo cobro.</p>
<div class="fields"><div class="field wide"><label for="reconcile-reservation">Reserva de ensayo</label><select id="reconcile-reservation" required></select></div>
<div class="field wide"><label for="reconcile-reference">Referencia numerica de ePayco</label><input id="reconcile-reference" inputmode="numeric" pattern="[1-9][0-9]{0,13}" maxlength="14" autocomplete="off" required><small>Es el numero que muestra ePayco, no el codigo BN26TEST.</small></div></div>
<div class="lab-actions"><button type="submit" class="button primary" id="sync-payment">Sincronizar con ePayco</button><button type="button" class="button secondary" id="reload-reconcile">Actualizar lista</button></div>
<p id="reconcile-message" role="status" aria-live="polite"></p></form>`;
workspace.prepend(panel);
const el=id=>document.getElementById(id);
function notice(id,text){el(id).textContent=text;}
const statusNames={confirmed:'Confirmada (prueba)',declined:'Rechazada',payment_pending:'Pendiente',held:'Retenida',opening:'Preparando',review:'En revision',expired:'Vencida',cancelled:'Cancelada'};
function paymentError(code){
 if(code==='PROVIDER_AUTH_OR_PERMISSION')return 'ePayco no autorizo la consulta. Revisa el permiso de consulta de transacciones; no se modifico el pago.';
 if(code==='PROVIDER_QUERY_NOT_SUCCESSFUL'||code==='PROVIDER_DETAIL_INCOMPLETE')return 'ePayco no devolvio un detalle completo verificable. La reserva no se ha confirmado.';
 if(code==='RESERVATION_INVOICE_MISMATCH'||code==='RESERVATION_AMOUNT_MISMATCH')return 'La referencia no corresponde a esta reserva o a su importe. Revisa la seleccion.';
 if(code==='TEST_MODE_REQUIRED'||code==='NOT_A_TEST_PAYMENT')return 'Solo se admiten transacciones de prueba. No se aplico el pago.';
 return 'No se completo la verificacion ('+String(code||'respuesta incompleta').slice(0,90)+'). No vuelvas a pagar.';
}
async function loadReservations(force=false){
 if(workspace.hidden||loading||(!force&&Date.now()-lastLoad<3000))return;
 loading=true;el('reload-reconcile').disabled=true;
 try{
  const d=await api('admin',{},true);
  if(d.settings?.mode!=='test'||!Array.isArray(d.reservations))throw Error('El laboratorio debe estar en modo test.');
  const previous=el('reconcile-reservation').value;
  let saved;try{saved=JSON.parse(storage.getItem('bn2026-last-payment')||'null');}catch{}
  const options=d.reservations.map(r=>new Option('Mesa '+r.table_number+' - '+money(r.amount)+' - '+(statusNames[r.status]||'Por revisar')+' - '+r.invoice,r.id));
  el('reconcile-reservation').replaceChildren(...options);
  const selected=previous||saved?.id;
  if(d.reservations.some(r=>r.id===selected))el('reconcile-reservation').value=selected;
  el('sync-payment').disabled=!options.length||syncing;
  if(!options.length)notice('reconcile-message','Todavia no hay reservas de prueba para sincronizar.');
  lastLoad=Date.now();
 }catch(e){notice('reconcile-message',e.message);}
 finally{loading=false;el('reload-reconcile').disabled=false;}
}
el('password-change-form').addEventListener('submit',async ev=>{
 ev.preventDefault();const password=el('new-password').value;
 if(password!==el('repeat-password').value){notice('password-message','Las contrasenas no coinciden.');return;}
 if(password.length<16||password.length>128){notice('password-message','Utiliza entre 16 y 128 caracteres.');return;}
 el('save-password').disabled=true;notice('password-message','Actualizando acceso...');
 try{
  const token=await currentToken();if(!token)throw Error('Necesitas una sesion valida para cambiar la contrasena.');
  const r=await fetch(CONFIG.authUrl+'/user',{method:'PUT',headers:{apikey:CONFIG.anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
   if(['reauthentication_needed','reauthentication_not_valid','current_password_required','invalid_credentials'].includes(data.code)||r.status===401)throw Error('Supabase exige verificar de nuevo tu acceso. No se han desactivado sus protecciones.');
   throw Error('Supabase no acepto el cambio de contrasena. Revisa los requisitos de seguridad antes de reintentar.');
  }
  if(typeof data.id!=='string')throw Error('No se pudo comprobar el cambio de acceso.');
  notice('password-message','Contrasena actualizada. Guarda la nueva en tu gestor de contrasenas.');
 }catch(e){notice('password-message',e.message);}
 finally{el('new-password').value='';el('repeat-password').value='';el('save-password').disabled=false;}
});
el('reconcile-form').addEventListener('submit',async ev=>{
 ev.preventDefault();if(syncing)return;
 const reservationId=el('reconcile-reservation').value,reference=el('reconcile-reference').value.trim();
 if(!/^[1-9][0-9]{0,13}$/.test(reference)||!reservationId){notice('reconcile-message','Selecciona la reserva e indica la referencia numerica de ePayco.');return;}
 syncing=true;el('sync-payment').disabled=true;notice('reconcile-message','Consultando el intento existente en ePayco. No se esta cobrando de nuevo...');
 try{
  const token=await currentToken();if(!token)throw Error('La sesion ya no esta disponible. Ingresa al laboratorio.');
  const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json',apikey:CONFIG.anonKey,Authorization:'Bearer '+token},body:JSON.stringify({action:'reconcile',reservationId,reference}),signal:AbortSignal.timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.received!==true||d.mode!=='test')throw Error(paymentError(d.error));
  const text=statusNames[d.status]||'Verificacion pendiente';
  notice('reconcile-message','Estado verificado: '+text+'. No se realizo otro cobro.');
  el('refresh').click();el('check-status').click();await loadReservations(true);
 }catch(e){notice('reconcile-message',e.message);}
 finally{syncing=false;el('sync-payment').disabled=!el('reconcile-reservation').options.length;}
});
el('reload-reconcile').addEventListener('click',()=>void loadReservations(true));
new MutationObserver(()=>{if(!workspace.hidden)void loadReservations();}).observe(workspace,{attributes:true,attributeFilter:['hidden']});
void loadReservations();
