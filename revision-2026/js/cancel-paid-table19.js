import {api,currentToken} from './api.js?v=member-directory-20261004-1';
import {CONFIG} from './config.js?v=member-directory-20261004-2';

const TARGET_RESERVATION_ID='3fe6a52a-0878-464c-b582-ff498b945612';
const TARGET_TABLE=19;
const PANEL_ID='paid-table19-cancellation-panel';
const ENDPOINT=CONFIG.apiUrl.replace(/\/bn2026-api$/, '/bn2026-admin-cancel-table19');

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 '"':'&quot;',
 "'":'&#39;'
}[char]));

const money=value=>new Intl.NumberFormat('es-CO',{
 style:'currency',
 currency:'COP',
 maximumFractionDigits:0
}).format(Number(value||0));

const todayBogota=()=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/Bogota',
 year:'numeric',
 month:'2-digit',
 day:'2-digit'
}).format(new Date());

async function currentTarget(){
 const snapshot=await api('admin',{},true);
 const reservation=(snapshot?.reservations||[]).find(item=>item.id===TARGET_RESERVATION_ID);
 const table=(snapshot?.tables||[]).find(item=>Number(item.number)===TARGET_TABLE);
 return {reservation,table};
}

function eligible(reservation){
 return reservation?.id===TARGET_RESERVATION_ID
  && Number(reservation.table_number)===TARGET_TABLE
  && reservation.source==='checkout'
  && reservation.status==='confirmed'
  && reservation.payment_status==='approved'
  && reservation.provider_status==='approved';
}

function appendAction(reservation){
 const body=document.getElementById('admin-dialog-body');
 if(!body||document.getElementById(PANEL_ID)||!eligible(reservation))return;
 const panel=document.createElement('section');
 panel.id=PANEL_ID;
 panel.className='notice-box';
 panel.style.marginTop='20px';
 panel.innerHTML=`
  <strong>Cancelación controlada de la mesa 19</strong>
  <p>Utiliza esta opción solamente después de que Cartera haya procesado la devolución en Prosof.</p>
  <p><strong>Este módulo no devuelve dinero ni modifica el pago de ePayco.</strong> Registra la referencia de Prosof, cancela esta reserva y libera exclusivamente la mesa 19.</p>
  <button type="button" class="button secondary" id="open-paid-table19-cancellation">Registrar devolución Prosof y liberar mesa 19</button>`;
 body.append(panel);
 document.getElementById('open-paid-table19-cancellation')?.addEventListener('click',()=>renderForm(reservation));
}

async function injectWhenReady(){
 for(let attempt=0;attempt<40;attempt++){
  const dialog=document.getElementById('admin-dialog');
  const body=document.getElementById('admin-dialog-body');
  if(dialog?.open&&body){
   try{
    const {reservation}=await currentTarget();
    appendAction(reservation);
   }catch{
    // El administrador principal seguirá funcionando aunque esta consulta aislada falle.
   }
   return;
  }
  await new Promise(resolve=>setTimeout(resolve,75));
 }
}

function renderForm(reservation){
 const body=document.getElementById('admin-dialog-body');
 if(!body||!eligible(reservation))return;
 const paid=reservation.amount_paid??reservation.amount;
 body.innerHTML=`
  <div class="notice-box">
   <strong>Operación restringida a la reserva actual de la mesa 19</strong>
   <p>La devolución debe estar procesada previamente por Cartera en Prosof. Esta acción no ejecuta movimientos financieros.</p>
  </div>
  <div class="review-block" style="margin-top:16px">
   <p>Mesa: <strong>19</strong></p>
   <p>Responsable: <strong>${escapeHtml(reservation.responsible_name)}</strong></p>
   <p>Referencia de reserva: <strong>${escapeHtml(reservation.invoice)}</strong></p>
   <p>Referencia ePayco: <strong>${escapeHtml(reservation.provider_ref||'Verificada')}</strong></p>
   <p>Valor aprobado: <strong>${escapeHtml(money(paid))}</strong></p>
  </div>
  <form id="paid-table19-cancellation-form" style="margin-top:18px">
   <div class="field">
    <label for="table19-cancel-reason">Motivo de la cancelación</label>
    <textarea id="table19-cancel-reason" maxlength="300" required placeholder="Ej. El socio no utilizará la mesa y solicitó la devolución."></textarea>
   </div>
   <div class="field">
    <label for="table19-prosof-reference">Documento o referencia de devolución en Prosof</label>
    <input id="table19-prosof-reference" maxlength="100" required autocomplete="off" placeholder="Número de documento, comprobante o referencia">
   </div>
   <div class="field">
    <label for="table19-refund-date">Fecha de la devolución en Prosof</label>
    <input id="table19-refund-date" type="date" max="${todayBogota()}" required>
   </div>
   <div class="field">
    <label for="table19-cancel-notes">Observación adicional</label>
    <textarea id="table19-cancel-notes" maxlength="500" placeholder="Opcional"></textarea>
   </div>
   <label class="checkbox-row">
    <input id="table19-refund-confirmed" type="checkbox" required>
    <span>Confirmo que Cartera ya procesó la devolución en Prosof y que la mesa 19 puede liberarse.</span>
   </label>
   <div class="field">
    <label for="table19-release-confirmation">Escribe <strong>LIBERAR 19</strong> para confirmar</label>
    <input id="table19-release-confirmation" autocomplete="off" required placeholder="LIBERAR 19">
   </div>
   <p id="table19-cancel-error" class="error-box" role="alert" hidden></p>
   <button type="submit" class="button primary">Registrar devolución y liberar únicamente la mesa 19</button>
  </form>`;
 document.getElementById('paid-table19-cancellation-form')?.addEventListener('submit',submitCancellation);
}

async function submitCancellation(event){
 event.preventDefault();
 const form=event.currentTarget;
 const button=form.querySelector('button[type="submit"]');
 const error=document.getElementById('table19-cancel-error');
 const reason=document.getElementById('table19-cancel-reason')?.value.trim()||'';
 const prosofReference=document.getElementById('table19-prosof-reference')?.value.trim()||'';
 const refundDate=document.getElementById('table19-refund-date')?.value||'';
 const notes=document.getElementById('table19-cancel-notes')?.value.trim()||'';
 const confirmed=document.getElementById('table19-refund-confirmed')?.checked===true;
 const confirmation=document.getElementById('table19-release-confirmation')?.value.trim()||'';

 if(!confirmed){
  error.textContent='Debes confirmar que Cartera ya realizó la devolución en Prosof.';
  error.hidden=false;
  return;
 }
 if(confirmation!=='LIBERAR 19'){
  error.textContent='Escribe exactamente LIBERAR 19 para continuar.';
  error.hidden=false;
  return;
 }

 button.disabled=true;
 error.hidden=true;
 try{
  const token=await currentToken();
  if(!token)throw new Error('La sesión administrativa venció. Ingresa nuevamente.');
  const response=await fetch(ENDPOINT,{
   method:'POST',
   headers:{
    'Content-Type':'application/json',
    apikey:CONFIG.anonKey,
    Authorization:'Bearer '+token
   },
   body:JSON.stringify({
    reservationId:TARGET_RESERVATION_ID,
    reason,
    prosofReference,
    refundDate,
    notes,
    confirmation
   }),
   signal:AbortSignal.timeout(20000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'No fue posible completar la operación. No se liberó la mesa.');

  const verification=await api('admin',{},true);
  const updated=(verification?.reservations||[]).find(item=>item.id===TARGET_RESERVATION_ID);
  if(updated?.status!=='cancelled')throw new Error('La verificación posterior no confirmó la cancelación. Revisa el caso antes de continuar.');

  const body=document.getElementById('admin-dialog-body');
  if(body){
   body.innerHTML=`
    <div class="notice-box">
     <strong>Mesa 19 liberada correctamente</strong>
     <p>La reserva quedó cancelada, el pago aprobado se conservó intacto y se registró la referencia de Prosof.</p>
     <p>Referencia Prosof: <strong>${escapeHtml(result.prosofReference||prosofReference)}</strong></p>
     <p>Valor histórico conservado: <strong>${escapeHtml(money(result.amount||0))}</strong></p>
    </div>
    <button type="button" class="button primary full" id="reload-after-table19-cancellation">Actualizar administrador</button>`;
   document.getElementById('reload-after-table19-cancellation')?.addEventListener('click',()=>location.reload());
  }
 }catch(problem){
  error.textContent=problem?.message||'No fue posible completar la operación. No se liberó la mesa.';
  error.hidden=false;
  button.disabled=false;
 }
}

document.addEventListener('click',event=>{
 const button=event.target.closest?.('button');
 if(!button)return;
 const opensTargetReservation=button.dataset.detail===TARGET_RESERVATION_ID;
 const opensTargetTable=Number(button.dataset.tableDetail)===TARGET_TABLE;
 if(opensTargetReservation||opensTargetTable)void injectWhenReady();
},true);
