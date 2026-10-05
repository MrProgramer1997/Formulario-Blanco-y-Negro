import {storage} from './domain.js?v=member-directory-20261004-1';
import {CONFIG} from './config.js?v=member-directory-20261004-2';
const KEY='bn2026-admin-session';
let refreshTask=null;
// Session tokens stay in this tab only, not localStorage.
export function session(){try{return JSON.parse(storage.getItem(KEY)||'null');}catch{return null;}}
export function saveSession(value){storage.setItem(KEY,JSON.stringify({...value,expires_at:Date.now()+value.expires_in*1000}));}
export function clearSession(){storage.removeItem(KEY);}
export async function currentToken(){
 const s=session();if(!s)return null;
 if(s.expires_at>=Date.now()+60000)return s.access_token;
 // Multiple panels can request a token concurrently. Rotate it only once.
 if(!refreshTask){
  refreshTask=(async()=>{
   try{
    const r=await fetch(CONFIG.authUrl+'/token?grant_type=refresh_token',{method:'POST',headers:{apikey:CONFIG.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error();const updated=await r.json();
    if(typeof updated.access_token!=='string'||typeof updated.refresh_token!=='string')throw Error();
    // Do not recreate a session if the user signed out during the request.
    if(!session())return null;
    saveSession(updated);return updated.access_token;
   }catch{clearSession();throw new Error('La sesion vencio. Ingresa nuevamente.');}
  })().finally(()=>{refreshTask=null;});
 }
 return refreshTask;
}
export async function api(action,body={},privateCall=false){
 const token=privateCall?await currentToken():null;
 if(privateCall&&!token)throw new Error('Debes iniciar sesion como administrador.');
 const r=await fetch(CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:CONFIG.anonKey,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(25000)});
 const data=await r.json().catch(()=>({error:'Respuesta no valida del servidor.'}));
 if(!r.ok)throw new Error(data.error||'No fue posible completar la solicitud.');
 return data;
}
export async function liveApi(action,body={},privateCall=false){
 const token=privateCall?await currentToken():null;
 if(privateCall&&!token)throw new Error('Debes iniciar sesion como administrador.');
 const r=await fetch(CONFIG.liveApiUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:CONFIG.anonKey,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(25000)});
 const data=await r.json().catch(()=>({error:'Respuesta no valida del servidor de produccion.'}));
 if(!r.ok){const err=new Error(data.error||'No fue posible completar la operacion de produccion.');err.data=data;err.httpStatus=r.status;throw err;}
 return data;
}
export async function login(username,password){
 const result=await api('login',{username,password});saveSession(result);return result;
}
export async function logout(){
 const token=session()?.access_token;clearSession();
 if(token)await fetch(CONFIG.authUrl+'/logout',{method:'POST',headers:{apikey:CONFIG.anonKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)}).catch(()=>{});
}
export async function openCheckout(sessionId,test,onChange){
 if(!window.ePayco){
  await new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src='https://checkout.epayco.co/checkout-v2.js';
   s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('No cargo ePayco. Revisa tu conexion e intenta otra vez.'));};document.head.append(s);
  });
 }
 const checkout=window.ePayco.checkout.configure({sessionId,type:'onpage',test});
 let responseSeen=false;
 checkout.setHooks({
  onResponse:data=>{responseSeen=true;onChange(data);},
  onClosed:()=>{if(!responseSeen)onChange({bnEvent:'closed'});},
  onErrors:()=>onChange({bnEvent:'error',error:true}),
 });
 checkout.open();
}

export async function confirmationStatus(){
 const token=await currentToken();if(!token)throw Error('Ingresa como administrador.');
 const url=CONFIG.apiUrl.replace(/\/bn2026-api$/, '/bn2026-webhook');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',apikey:CONFIG.anonKey,Authorization:'Bearer '+token},body:JSON.stringify({action:'queue_status'}),signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.automatic!==true)throw Error('No se pudo verificar la confirmacion automatica. No inicies otro pago.');
 return data;
}
