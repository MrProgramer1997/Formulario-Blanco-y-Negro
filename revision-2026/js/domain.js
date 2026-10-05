import { EVENT } from './config.js?v=member-directory-20261004-2';
export const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const blankPerson = () => ({memberId:'',memberName:'',firstName:'',lastName:'',action:'',docType:'CC',document:'',email:'',phone:''});
export function createDraft() {
 return {version:2,step:0,table:null,quantity:8,guests:0,responsibleAttends:true,responsibleType:'member',
  responsible:{firstName:'',lastName:'',email:'',phone:''},members:Array.from({length:10},blankPerson),
  visitors:Array.from({length:10},blankPerson),terms:false,remember:false};
}
export function setQuantity(draft, n) {
 if (![8,9,10].includes(n)) throw new RangeError('Cantidad no permitida');
 draft.quantity=n; draft.guests=Math.min(draft.guests,n);
 ensureResponsibleCount(draft); draft.terms=false;
 // Do not truncate the arrays: changing counts must never erase already entered data.
}
export function setGuests(draft,n) {
 if (!Number.isInteger(n) || n<0 || n>draft.quantity) return false;
 draft.guests=n; ensureResponsibleCount(draft); draft.terms=false; return true;
}
function ensureResponsibleCount(d) {
 if(!d.responsibleAttends) return;
 if(d.responsibleType==='member') d.guests=Math.min(d.guests,d.quantity-1);
 else d.guests=Math.max(d.guests,1);
}
export function syncResponsible(d) {
 ensureResponsibleCount(d);
 if(!d.responsibleAttends||d.responsibleType!=='guest') return;
 const target=d.visitors[0];
 target.firstName=d.responsible.firstName; target.lastName=d.responsible.lastName;
 target.email=d.responsible.email;target.phone=d.responsible.phone;
}
export function totals(d,prices=EVENT) {
 const members=d.quantity-d.guests, guests=d.guests;
 return {members,guests,memberTotal:members*prices.memberPrice,guestTotal:guests*prices.guestPrice,total:members*prices.memberPrice+guests*prices.guestPrice};
}
export const isEmail = s=>typeof s==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length<=254;
export const isPhone = s=>typeof s==='string' && /^\+?[0-9 ()-]{7,25}$/.test(s) && s.replace(/\D/g,'').length>=7;
export function personErrors(p,type) {
 const errors=[];
 if(type==='member'){
  if(typeof p.memberId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.memberId)||!p.memberName?.trim()||!p.action?.trim()) errors.push('search');
  return errors;
 }
 if(!p.firstName?.trim()||p.firstName.trim().length>80) errors.push('firstName');
 if(!p.lastName?.trim()||p.lastName.trim().length>80) errors.push('lastName');
 if(!['CC','CE','PAS','OTRO'].includes(p.docType)) errors.push('docType');
 if(!/^[A-Za-z0-9. -]{4,30}$/.test(p.document||'')) errors.push('document');
 if(!isEmail(p.email)) errors.push('email');
 if(!isPhone(p.phone)) errors.push('phone');
 return errors;
}
export function attendees(d) {
 return [...d.members.slice(0,d.quantity-d.guests).map((p,i)=>({...p,type:'member',index:i})),
 ...d.visitors.slice(0,d.guests).map((p,i)=>({...p,type:'guest',index:i}))];
}
export function duplicates(d){
 const memberIds=new Set(),guestDocs=new Set();
 for(const p of attendees(d)){
  if(p.type==='member'){
   if(!p.memberId)continue;
   if(memberIds.has(p.memberId))return true;
   memberIds.add(p.memberId);
  }else{
   const key=p.docType+':'+p.document.replace(/[ .-]/g,'').toUpperCase();
   if(!p.document)continue;
   if(guestDocs.has(key))return true;
   guestDocs.add(key);
  }
 }
 return false;
}
export function toPayload(d){
 return {table:d.table,quantity:d.quantity,responsible:{...d.responsible},
 attendees:attendees(d).map(({index,type,...p})=>type==='member'
  ?{type:'member',memberId:p.memberId}
  :{type:'guest',firstName:p.firstName,lastName:p.lastName,docType:p.docType,document:p.document,email:p.email,phone:p.phone}),
 acceptedTerms:d.terms};
}
export function csvCell(v){
 let text=String(v??'');
 if(/^[\s]*[=+@-]/.test(text)) text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
const volatileStore=new Map();
export const storage={
 getItem(k){try{return sessionStorage.getItem(k);}catch{return volatileStore.get(k)||null;}},
 setItem(k,v){try{sessionStorage.setItem(k,v);return true;}catch{volatileStore.set(k,String(v));return false;}},
 removeItem(k){try{sessionStorage.removeItem(k);}catch{}volatileStore.delete(k);}
};
export function requestUUID(){
 if(crypto.randomUUID)return crypto.randomUUID();
 return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
}
