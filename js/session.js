// A server-verifiable bearer session, kept in IndexedDB, never a role flag.
const authDB=new window.Dexie('cancionero-auth');authDB.version(1).stores({session:'id'});
let current=null;
export async function loadSession(){current=await authDB.session.get('editor').catch(()=>null);if(current&&Date.parse(current.expiresAt)<Date.now()){await clearSession();}return current;}
export const getSession=()=>current;
export async function setSession(value){current={id:'editor',token:value.token,expiresAt:value.expiresAt};await authDB.session.put(current);window.dispatchEvent(new Event('cancionero:auth'));}
export async function clearSession(){current=null;await authDB.session.delete('editor').catch(()=>{});window.dispatchEvent(new Event('cancionero:auth'));}
