import {api,login,logout,session,openCheckout} from './api.js';
import {storage,money,escapeHTML,requestUUID,isEmail,isPhone} from './domain.js';
import {AMOUNTS,groupTotals,makeBooking,requireTestSession,TERMINAL} from './payment-lab-model.js';
const $=id=>document.getElementById(id),STORE='bn2026-lab-operation';
const labels={confirmed:'Confirmada (simulacion)',held:'Solicitud retenida',opening:'Preparando pago',payment_pending:'Esperando la confirmacion de ePayco',review:'Necesita revision. No vuelvas a pagar.',declined:'Pago rechazado',expired:'Solicitud vencida',cancelled:'Cancelada'};
let selected='T1000',prices=null,operation=null,busy=false,ready=false,polling=false,timer=null,checks=0;
try{const saved=JSON.parse(storage.getItem(STORE)||'null');if(saved&&typeof saved.token==='string'&&Object.hasOwn(AMOUNTS,saved.testCase)){operation=saved;selected=saved.testCase;}}catch{}
function message(text){$('lab-message').hidden=!text;$('lab-message').textContent=text;}
function persist(){storage.setItem(STORE,JSON.stringify(operation));if(operation?.id)storage.setItem('bn2026-last-payment',JSON.stringify({id:operation.id,token:operation.token,lab:true}));}
function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
function controls(){
  $('payment-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=busy||!!operation||!ready);
  $('lab-tracking').hidden=!operation;$('retry-request').hidden=!operation?.body||!!operation.id;$('retry-request').disabled=busy;
  $('check-status').disabled=busy||!operation?.id;
  $('reopen-checkout').hidden=!operation?.sessionId||operation.opened===true||operation.status!=='payment_pending';
  $('reopen-checkout').disabled=busy;
  $('next-test').hidden=!operation||!TERMINAL.includes(operation.status);
}
function group(){try{const q=Number($('quantity').value);$('members').max=String(q);const t=groupTotals(q,Number($('members').value),prices?.memberPrice,prices?.guestPrice);$('guests').value=t.guests;$('commercial-total').textContent=t.members+' socios + '+t.guests+' invitados. Total con tarifas del evento: '+money(t.commercial)+'.\nEn este ensayo se enviara solo '+money(AMOUNTS[selected])+'.';$('pay-total').textContent=money(AMOUNTS[selected]);}catch(e){$('commercial-total').textContent=e.message;}}
function tracking(){if(!operation)return;$('tracking-reference').textContent=operation.invoice?'Referencia: '+operation.invoice:(operation.id?'Solicitud: '+operation.id:'Solicitud en curso. No inicies un pago diferente.');$('tracking-state').textContent=labels[operation.status]||'Verificacion pendiente';controls();}
async function refresh(){
  const [c,d]=await Promise.all([api('catalog'),api('admin',{},true)]);
  if(c.mode!=='test'||d.settings?.mode!=='test')throw Error('Este enlace solo admite el entorno de pruebas.');
  prices=c;ready=d.settings.keysConfigured===true;const free=c.tables.filter(t=>t.status==='available'),chosen=$('table').value;
  $('table').replaceChildren(...free.map(t=>new Option('Mesa '+t.number+' - '+t.zone,String(t.number))));
  if(free.some(t=>String(t.number)===chosen))$('table').value=chosen;
  $('connection').textContent=ready?'SUPABASE CONECTADO - MODO TEST':'CONFIGURACION DE EPAYCO PENDIENTE';
  $('available').textContent=free.length;const approved=d.reservations.filter(r=>r.status==='confirmed');$('confirmed').textContent=approved.length;$('simulated-total').textContent=money(approved.reduce((n,r)=>n+r.amount,0));
  $('reservation-rows').innerHTML=d.reservations.length?d.reservations.map(r=>'<tr><td>'+escapeHTML(r.table_number)+'</td><td>'+escapeHTML(r.invoice)+'</td><td>'+escapeHTML(labels[r.status]||r.status)+'</td><td>'+money(r.amount)+'</td></tr>').join(''):'<tr><td colspan="4">Todavia no hay reservas de prueba.</td></tr>';
  $('lab-login').hidden=true;$('lab-workspace').hidden=false;if(!ready)message('El servidor indica que faltan llaves. No se iniciara el pago.');
  group();controls();tracking();
}
async function check(){
  if(polling||!operation?.id)return;polling=true;
  try{const r=await api('status',{id:operation.id,token:operation.token});operation.status=r.status;operation.invoice=r.invoice;persist();tracking();if(TERMINAL.includes(r.status)||r.status==='review'){clearInterval(timer);await refresh();}}
  catch(e){message(e.message);}finally{polling=false;controls();}
}
function startPolling(){clearInterval(timer);checks=0;timer=setInterval(()=>{if(document.hidden)return;if(++checks>120){clearInterval(timer);return;}void check();},5000);}
async function open(){
  if(!operation?.sessionId||operation.status!=='payment_pending'||busy)return;
  busy=true;controls();
  try{await openCheckout(operation.sessionId,true,()=>void check());operation.opened=true;persist();startPolling();}
  catch(e){message(e.message+' La sesion ya esta preparada; no crees un pago diferente.');}
  finally{busy=false;controls();}
}
async function send(){
  if(busy||!operation?.body)return;busy=true;controls();message('Preparando la sesion de prueba en ePayco...');
  try{const r=requireTestSession(await api('checkout',operation.body,true),operation.testCase);operation={id:r.reservationId,sessionId:r.sessionId,token:operation.token,testCase:operation.testCase,status:'payment_pending',opened:false};persist();tracking();message('Sesion de prueba preparada. Usa solo los datos de prueba de ePayco.');}
  catch(e){message(e.message+' No inicies otra solicitud mientras verificamos esta.');}
  finally{busy=false;controls();}
  if(operation?.sessionId&&operation.opened!==true)await open();
}
$('login-form').addEventListener('submit',async ev=>{ev.preventDefault();$('login-button').disabled=true;try{await login($('username').value,$('password').value);$('password').value='';await refresh();if(ready)message('Acceso validado. Elige un importe de ensayo.');if(operation?.id){void check();if(!TERMINAL.includes(operation.status)&&operation.status!=='review')startPolling();}}catch(e){message(e.message);}finally{$('login-button').disabled=false;}});
$('amounts').addEventListener('click',ev=>{const b=ev.target.closest('[data-case]');if(!b||operation)return;selected=b.dataset.case;document.querySelectorAll('[data-case]').forEach(x=>{const active=x===b;x.setAttribute('aria-pressed',String(active));x.classList.toggle('active',active);});group();});
['members','quantity'].forEach(id=>$(id).addEventListener('input',group));
$('payment-form').addEventListener('submit',async ev=>{ev.preventDefault();if(busy||operation||!ready)return;
  try{const responsible={firstName:$('first-name').value.trim(),lastName:$('last-name').value.trim(),email:$('payer-email').value.trim(),phone:$('payer-phone').value.trim()};
    if(!responsible.firstName||!responsible.lastName||!isEmail(responsible.email)||!isPhone(responsible.phone))throw Error('Revisa los datos del pagador.');
    if(!$('accepted').checked)throw Error('Confirma que vas a usar datos de prueba.');
    const token=randomToken();const body=makeBooking({table:Number($('table').value),quantity:Number($('quantity').value),members:Number($('members').value),testCase:selected,responsible},requestUUID(),token);
    operation={body,token,testCase:selected,status:'opening'};persist();tracking();await send();
  }catch(e){message(e.message);}
});
$('retry-request').addEventListener('click',()=>void send());$('check-status').addEventListener('click',()=>void check());$('reopen-checkout').addEventListener('click',()=>void open());
$('next-test').addEventListener('click',()=>{if(!operation||!TERMINAL.includes(operation.status))return;operation=null;storage.removeItem(STORE);storage.removeItem('bn2026-last-payment');clearInterval(timer);message('Puedes preparar otro ensayo.');refresh().catch(e=>message(e.message));});
$('refresh').addEventListener('click',()=>refresh().catch(e=>message(e.message)));
$('logout').addEventListener('click',async()=>{clearInterval(timer);await logout();ready=false;$('lab-workspace').hidden=true;$('lab-login').hidden=false;message('Sesion cerrada. Una solicitud pendiente no se cancela al salir.');});
document.querySelectorAll('[data-case]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.case===selected));b.classList.toggle('active',b.dataset.case===selected);});
group();if(session())refresh().then(()=>{if(operation?.id){void check();if(!TERMINAL.includes(operation.status)&&operation.status!=='review')startPolling();}}).catch(e=>{message(e.message);$('lab-workspace').hidden=true;$('lab-login').hidden=false;});
