// A server-verifiable bearer session, kept in IndexedDB, never a role flag.
const authDB=new window.Dexie('cancionero-auth');authDB.version(1).stores({session:'id'});
let current=null,persisted=false;

export async function loadSession(){
 const saved=await authDB.session.get('editor').catch(()=>null);
 if(!saved?.token||!(Date.parse(saved.expiresAt)>Date.now()))return null;
 current=saved;
 persisted=true;
 return current;
}

export const getSession=()=>current;
export const canReloadSession=()=>!current||persisted;

export async function setSession(value){
 const session={id:'editor',token:value.token,expiresAt:value.expiresAt};
 current=session;
 persisted=false;
 window.dispatchEvent(new Event('cancionero:auth'));
 try{
  await authDB.session.put(session);
  if(current===session)persisted=true;
 }catch{
  // A failure to remember the session should not reject a valid sign-in.
 }
}

export async function clearSession(){
 current=null;
 persisted=false;
 const removal=authDB.session.delete('editor');
 window.dispatchEvent(new Event('cancionero:auth'));
 await removal.catch(()=>{});
}
