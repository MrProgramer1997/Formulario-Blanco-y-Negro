import {storage,requestUUID} from './domain.js?v=member-directory-20261004-2';

const KEY='bn2026-live-checkout-v1';
export const TERMINAL_STATES=Object.freeze(['confirmed','declined','expired','cancelled']);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);

export function validateLiveCheckout(data,expected){
 if(data?.test!==false||data?.live!==true||data.amount!==expected||!uuid(data.reservationId)||typeof data.sessionId!=='string'||!data.sessionId||data.sessionId.length>512){
  throw Error('La respuesta no corresponde al pago comercial esperado. No se abrira ePayco ni se creara otro pago.');
 }
 return data;
}

export function createLiveCheckoutFlow(liveApi,{store=storage,newId=requestUUID,newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')}={}){
 let pending=null,inFlight=false;

 try{
  const saved=JSON.parse(store.getItem(KEY)||'null');
  if(saved&&uuid(saved.requestId)&&typeof saved.statusToken==='string'&&/^[a-f0-9]{64}$/.test(saved.statusToken))pending=saved;
 }catch{}

 function persist(){
  if(store.setItem(KEY,JSON.stringify(pending))===false){
   throw Error('El navegador no permite conservar este intento. Habilita el almacenamiento de la pestana antes de pagar.');
  }
 }

 async function readCurrentStatus(){
  const id=pending?.result?.reservationId||pending?.reservationId;
  if(!id)throw Error('La respuesta del servidor quedo interrumpida. Reintenta solo la misma solicitud; no prepares otra.');
  const state=await liveApi('status',{id,token:pending.statusToken});
  if(state?.id!==id||state.amount!==pending.expectedAmount||!['held','opening','payment_pending','confirmed','declined','expired','cancelled','review'].includes(state.status)){
   throw Error('No se recibio un estado verificable. No prepares otro pago.');
  }
  pending.status=state.status;persist();return state;
 }

 async function send(){
  if(inFlight)throw Error('Ya hay una solicitud en curso.');
  if(!pending)throw Error('No existe un intento para continuar.');

  if(pending.result){
   inFlight=true;
   try{
    const state=await readCurrentStatus();
    if(state.status!=='payment_pending')throw Error('Este intento ya tiene resultado o requiere revision. Usa Ver resultado; no vuelvas a pagar.');
    return validateLiveCheckout(pending.result,pending.expectedAmount);
   }finally{inFlight=false;}
  }

  if(!pending.body)throw Error('Este intento requiere revision. No inicies otro pago.');
  inFlight=true;
  try{
   const raw=await liveApi('checkout',pending.body);
   if(uuid(raw?.reservationId))pending.reservationId=raw.reservationId;
   const result=validateLiveCheckout(raw,pending.expectedAmount);
   pending={
    requestId:pending.requestId,
    statusToken:pending.statusToken,
    expectedAmount:pending.expectedAmount,
    reservationId:result.reservationId,
    result,
    status:'payment_pending'
   };
   persist();
   store.setItem('bn2026-last-payment',JSON.stringify({
    id:result.reservationId,
    token:pending.statusToken,
    live:true,
    source:'form'
   }));
   return result;
  }catch(err){
   if(pending){
    const hasReservation=uuid(err?.data?.reservationId);
    if(hasReservation){
     pending.reservationId=err.data.reservationId;
     const known=err?.data?.status;
     pending.status=['confirmed','declined','expired','cancelled','review','payment_pending','opening','held'].includes(known)
      ?known
      :(err?.data?.requiresReview===true?'review':'verification_pending');
     persist();
    }else if([400,409,422,429].includes(err?.httpStatus)){
     pending=null;
     store.removeItem(KEY);
    }else{
     pending.status='verification_pending';
     persist();
    }
   }
   throw err;
  }finally{inFlight=false;}
 }

 return {
  get operation(){return pending;},
  async begin(payload,expectedAmount){
   if(pending)throw Error('Ya existe un intento. Consulta su estado antes de preparar otro.');
   if(!Number.isSafeInteger(expectedAmount)||expectedAmount<=0)throw Error('Importe comercial no valido.');
   const requestId=newId(),statusToken=newToken();
   pending={requestId,statusToken,expectedAmount,status:'opening',body:{...payload,requestId,statusToken}};
   persist();
   return send();
  },
  retry:send,
  markOpened(){if(pending){pending.opened=true;pending.closed=false;persist();}},
  markClosed(){if(pending){pending.closed=true;pending.opened=false;persist();}},
  status:readCurrentStatus,
  async clearFinished(){
   const result=await this.status();
   if(!TERMINAL_STATES.includes(result.status))throw Error('La verificacion sigue pendiente. No se creara otro intento.');
   pending=null;
   store.removeItem(KEY);
   store.removeItem('bn2026-last-payment');
  }
 };
}
