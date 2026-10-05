/** Pure test-laboratory rules. The server independently calculates all amounts. */
export const AMOUNTS = Object.freeze({T1000:1000,T1500:1500,T3000:3000,T5500:5500});
export function groupTotals(quantity, members, memberPrice=180000, guestPrice=260000) {
  if (![8,9,10].includes(quantity) || !Number.isInteger(members) || members<0 || members>quantity) throw Error('Revisa la cantidad de socios.');
  if (![memberPrice,guestPrice].every(n=>Number.isSafeInteger(n)&&n>0)) throw Error('No se pudieron verificar las tarifas.');
  return {quantity,members,guests:quantity-members,commercial:members*memberPrice+(quantity-members)*guestPrice};
}
export function makeBooking(data, requestId, statusToken) {
  const t = groupTotals(data.quantity,data.members);
  if (!Object.hasOwn(AMOUNTS,data.testCase)) throw Error('Importe de ensayo no permitido.');
  if (!Number.isInteger(data.table)||data.table<1||data.table>45) throw Error('Selecciona una mesa de ensayo.');
  // Explicitly fictitious attendees. Only the tester supplies the payer contact.
  const attendees=Array.from({length:t.quantity},(_,i)=>i<t.members
    ? {type:'member',firstName:'Socio ensayo '+(i+1),lastName:'Prueba',action:'ENSAYO-'+(i+1)}
    : {type:'guest',firstName:'Invitado ensayo '+(i+1),lastName:'Prueba',docType:'OTRO',document:'ENSAYO'+String(i+1).padStart(4,'0'),email:data.responsible.email,phone:data.responsible.phone});
  return {table:data.table,quantity:t.quantity,responsible:data.responsible,attendees,acceptedTerms:true,testCase:data.testCase,requestId,statusToken};
}
export function requireTestSession(result, testCase) {
  if (result?.test!==true || result.amount!==AMOUNTS[testCase] || typeof result.sessionId!=='string' || !result.sessionId || typeof result.reservationId!=='string' || !/^[a-f0-9-]{36}$/i.test(result.reservationId)) throw Error('La respuesta no corresponde al ensayo solicitado. No se abrira ePayco.');
  return result;
}
export const TERMINAL = ['confirmed','declined','expired','cancelled'];
