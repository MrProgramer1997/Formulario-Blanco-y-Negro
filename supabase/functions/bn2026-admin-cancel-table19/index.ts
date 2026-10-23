const TARGET_RESERVATION_ID='3fe6a52a-0878-464c-b582-ff498b945612';
const allowedOrigins=new Set([
 'https://mrprogramer1997.github.io',
 'http://localhost:4173',
 'http://127.0.0.1:4173',
 'http://127.0.0.1:5500',
 'http://localhost:5500'
]);

class HttpError extends Error{
 constructor(public status:number,message:string){super(message);}
}

function secret(name:string):string{
 const value=Deno.env.get(name)?.trim();
 if(!value)throw new HttpError(503,'Configuracion del servidor pendiente.');
 return value;
}

function response(body:unknown,status=200,extra:Record<string,string>={}):Response{
 return new Response(JSON.stringify(body),{
  status,
  headers:{
   'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff',
   ...extra
  }
 });
}

async function readJson(req:Request):Promise<Record<string,unknown>>{
 const length=Number(req.headers.get('content-length')||0);
 if(length>8192)throw new HttpError(413,'Solicitud demasiado grande.');
 const text=await req.text();
 if(text.length>8192)throw new HttpError(413,'Solicitud demasiado grande.');
 try{
  const value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();
  return value;
 }catch{
  throw new HttpError(400,'Solicitud no valida.');
 }
}

const q=(value:string)=>encodeURIComponent(value);

async function db(path:string,method='GET',body?:unknown):Promise<any>{
 const role=secret('SUPABASE_SERVICE_ROLE_KEY');
 const result=await fetch(secret('SUPABASE_URL')+'/rest/v1/'+path,{
  method,
  headers:{
   apikey:role,
   Authorization:'Bearer '+role,
   'Content-Type':'application/json',
   Prefer:'return=representation'
  },
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(10000)
 });
 if(!result.ok){
  const payload=await result.json().catch(()=>({}));
  const code=String(payload?.message||payload?.code||'');
  if(code.includes('TARGET_RESERVATION_ONLY'))throw new HttpError(403,'Esta operacion esta habilitada exclusivamente para la reserva actual de la mesa 19.');
  if(code.includes('RESERVATION_NOT_CONFIRMED'))throw new HttpError(409,'La reserva ya no esta confirmada y no puede liberarse por este flujo.');
  if(code.includes('APPROVED_PAYMENT_REQUIRED'))throw new HttpError(409,'No se encontro un pago aprobado verificable para esta reserva.');
  if(code.includes('PAYMENT_AMOUNT_MISMATCH'))throw new HttpError(409,'El valor aprobado no coincide con la reserva. No se realizo ningun cambio.');
  if(code.includes('INVALID_PROSOF_REFERENCE'))throw new HttpError(400,'Registra una referencia valida de Prosof.');
  if(code.includes('INVALID_REFUND_DATE')||code.includes('REFUND_BEFORE_PAYMENT'))throw new HttpError(400,'La fecha de devolucion no es valida.');
  if(code.includes('INVALID_REASON'))throw new HttpError(400,'Registra un motivo de cancelacion valido.');
  if(code.includes('NOT_AUTHORIZED'))throw new HttpError(403,'No tienes autorizacion para esta operacion.');
  if(code.includes('TABLE_NOT_RELEASED')||code.includes('CANCELLATION_STATE_INCONSISTENT'))throw new HttpError(409,'La operacion no pudo completarse de forma consistente. No se libero la mesa.');
  throw new HttpError(503,'No fue posible completar la cancelacion de forma segura. No se libero la mesa.');
 }
 return result.status===204?null:result.json();
}

const rpc=(name:string,args:Record<string,unknown>)=>db('rpc/'+name,'POST',args);

async function adminIdentity(req:Request):Promise<{id:string,email:string}>{
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))throw new HttpError(401,'Debes iniciar sesion como administrador.');
 const userResponse=await fetch(secret('SUPABASE_URL')+'/auth/v1/user',{
  headers:{
   apikey:secret('SUPABASE_ANON_KEY'),
   Authorization:authorization
  },
  signal:AbortSignal.timeout(8000)
 });
 if(!userResponse.ok)throw new HttpError(401,'La sesion administrativa no es valida.');
 const user=await userResponse.json();
 if(typeof user?.id!=='string')throw new HttpError(401,'La sesion administrativa no es valida.');
 const rows=await db('bn_admin_users?select=user_id,email&enabled=eq.true&user_id=eq.'+q(user.id));
 if(!Array.isArray(rows)||!rows.length)throw new HttpError(403,'No tienes acceso administrativo a este evento.');
 return {id:user.id,email:rows[0].email};
}

async function rateLimit(bucket:string,limit:number,seconds:number):Promise<void>{
 const allowed=await rpc('bn_rate_limit',{p_bucket:bucket,p_limit:limit,p_seconds:seconds});
 if(allowed!==true)throw new HttpError(429,'Demasiados intentos. Espera un momento antes de volver a intentar.');
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 const cors:Record<string,string>={Vary:'Origin'};
 if(origin&&allowedOrigins.has(origin)){
  cors['Access-Control-Allow-Origin']=origin;
  cors['Access-Control-Allow-Headers']='authorization,apikey,content-type';
  cors['Access-Control-Allow-Methods']='POST,OPTIONS';
 }
 if(origin&&!allowedOrigins.has(origin))return response({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return response({error:'Metodo no permitido.'},405,cors);

 try{
  const body=await readJson(req);
  const admin=await adminIdentity(req);
  await rateLimit('cancel-paid-table19:'+admin.id,5,600);

  const reservationId=typeof body.reservationId==='string'?body.reservationId:'';
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  const prosofReference=typeof body.prosofReference==='string'?body.prosofReference.trim():'';
  const refundDate=typeof body.refundDate==='string'?body.refundDate:'';
  const notes=typeof body.notes==='string'?body.notes.trim():'';
  const confirmation=typeof body.confirmation==='string'?body.confirmation.trim():'';

  if(reservationId!==TARGET_RESERVATION_ID)throw new HttpError(403,'Esta operacion solo puede aplicarse a la reserva actual de la mesa 19.');
  if(confirmation!=='LIBERAR 19')throw new HttpError(400,'Escribe LIBERAR 19 para confirmar la operacion.');
  if(reason.length<5||reason.length>300)throw new HttpError(400,'Registra un motivo de cancelacion valido.');
  if(!prosofReference||prosofReference.length>100)throw new HttpError(400,'Registra la referencia de devolucion de Prosof.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(refundDate))throw new HttpError(400,'Registra una fecha de devolucion valida.');
  if(notes.length>500)throw new HttpError(400,'La observacion es demasiado larga.');

  const result=await rpc('bn_admin_cancel_paid_table19',{
   p_id:reservationId,
   p_actor:admin.id,
   p_reason:reason,
   p_prosof_reference:prosofReference,
   p_refund_date:refundDate,
   p_notes:notes||null
  });

  return response({ok:true,...result},200,cors);
 }catch(error){
  if(error instanceof HttpError)return response({error:error.message},error.status,cors);
  return response({error:'No fue posible completar la operacion. No se libero la mesa.'},500,cors);
 }
});
