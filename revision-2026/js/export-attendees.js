import {api} from './api.js?v=member-directory-20261004-1';

const EXPORT_BUTTON_ID='export-guests';
const EXPORT_LABEL='Exportar asistentes Excel';
const FILE_NAME='asistentes-blanco-negro-2026.xls';
const CONFIRMED_STATUS='confirmed';

const xml=value=>String(value??'').replace(/[<>&"']/g,char=>({
 '<':'&lt;',
 '>':'&gt;',
 '&':'&amp;',
 '"':'&quot;',
 "'":'&apos;'
}[char]));

const html=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 '"':'&quot;',
 "'":'&#39;'
}[char]));

function labelExportButton(){
 const button=document.getElementById(EXPORT_BUTTON_ID);
 if(!button)return;
 button.textContent=EXPORT_LABEL;
 button.setAttribute('aria-label',EXPORT_LABEL);
}

function showError(message){
 const dialog=document.getElementById('admin-dialog');
 const title=document.getElementById('admin-dialog-title');
 const body=document.getElementById('admin-dialog-body');
 if(!dialog||!title||!body){
  window.alert(message);
  return;
 }
 title.textContent='No se pudo exportar';
 body.innerHTML=`<p>${html(message)}</p>`;
 if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
}

async function mapWithConcurrency(items,limit,worker){
 const results=new Array(items.length);
 let cursor=0;
 async function run(){
  while(true){
   const index=cursor++;
   if(index>=items.length)return;
   results[index]=await worker(items[index],index);
  }
 }
 await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
 return results;
}

function normalizeAttendee(reservation,person){
 const member=person.kind==='member';
 return {
  table:reservation.table_number,
  invoice:reservation.invoice,
  responsible:reservation.responsible_name,
  kind:person.kind,
  type:member?'Socio / corporado':'Invitado',
  firstName:person.first_name||'',
  lastName:person.last_name||'',
  action:member?(person.member_action||''):'',
  docType:member?'':(person.doc_type||''),
  document:member?'':(person.document||''),
  email:member?'':(person.email||''),
  phone:member?'':(person.phone||''),
  status:'Confirmada'
 };
}

function validateReservationAttendees(reservation,attendees){
 if(!Array.isArray(attendees))throw new Error(`La mesa ${reservation.table_number} no devolvio una lista valida de asistentes.`);
 const members=attendees.filter(person=>person.kind==='member').length;
 const guests=attendees.filter(person=>person.kind==='guest').length;
 const expectedTotal=Number(reservation.quantity||0);
 const expectedMembers=Number(reservation.member_count||0);
 const expectedGuests=Number(reservation.guest_count||0);
 if(attendees.length!==expectedTotal||members!==expectedMembers||guests!==expectedGuests){
  throw new Error(`La mesa ${reservation.table_number} tiene una diferencia entre el resumen y sus asistentes. No se genero un archivo incompleto.`);
 }
}

async function readAttendees(){
 const admin=await api('admin',{},true);
 const reservations=(Array.isArray(admin?.reservations)?admin.reservations:[])
  .filter(reservation=>reservation.status===CONFIRMED_STATUS)
  .sort((a,b)=>Number(a.table_number)-Number(b.table_number)||String(a.invoice).localeCompare(String(b.invoice),'es'));

 const groups=await mapWithConcurrency(reservations,4,async reservation=>{
  const detail=await api('detail',{id:reservation.id},true);
  const attendees=Array.isArray(detail?.attendees)?detail.attendees:[];
  validateReservationAttendees(reservation,attendees);
  return attendees.map(person=>normalizeAttendee(reservation,person));
 });

 return groups.flat().sort((a,b)=>
  Number(a.table)-Number(b.table)||
  (a.kind===b.kind?0:a.kind==='member'?-1:1)||
  a.lastName.localeCompare(b.lastName,'es',{sensitivity:'base'})||
  a.firstName.localeCompare(b.firstName,'es',{sensitivity:'base'})
 );
}

const headers=['Mesa','Referencia','Responsable','Tipo','Nombres','Apellidos','Acción','Tipo documento','Documento','Correo','Celular','Estado'];

function worksheet(name,rows){
 const matrix=[headers,...rows.map(row=>[
  row.table,
  row.invoice,
  row.responsible,
  row.type,
  row.firstName,
  row.lastName,
  row.action,
  row.docType,
  row.document,
  row.email,
  row.phone,
  row.status
 ])];
 const body=matrix.map((row,index)=>
  '<Row>'+row.map(value=>`<Cell${index===0?' ss:StyleID="Header"':''}><Data ss:Type="String">${xml(value)}</Data></Cell>`).join('')+'</Row>'
 ).join('');
 return `<Worksheet ss:Name="${xml(name)}"><Table>${body}</Table></Worksheet>`;
}

function downloadWorkbook(rows){
 const guests=rows.filter(row=>row.kind==='guest');
 const workbook='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
  +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
  +'<Styles><Style ss:ID="Header"><Font ss:Bold="1"/></Style></Styles>'
  +worksheet('Todos los asistentes',rows)
  +worksheet('Invitados',guests)
  +'</Workbook>';
 const blob=new Blob([workbook],{type:'application/vnd.ms-excel;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download=FILE_NAME;
 link.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function exportAttendees(button){
 button.disabled=true;
 button.textContent='Generando Excel...';
 try{
  const rows=await readAttendees();
  if(!rows.length)throw new Error('No hay asistentes en reservas confirmadas para exportar.');
  downloadWorkbook(rows);
 }catch(error){
  showError(error?.message||'No fue posible generar el archivo de asistentes.');
 }finally{
  const current=document.getElementById(EXPORT_BUTTON_ID);
  if(current){
   current.disabled=false;
   current.textContent=EXPORT_LABEL;
  }
 }
}

document.addEventListener('click',event=>{
 const button=event.target.closest?.(`#${EXPORT_BUTTON_ID}`);
 if(!button)return;
 event.preventDefault();
 event.stopPropagation();
 event.stopImmediatePropagation();
 if(button.disabled)return;
 void exportAttendees(button);
},true);

const observer=new MutationObserver(labelExportButton);
observer.observe(document.documentElement,{childList:true,subtree:true});
labelExportButton();
