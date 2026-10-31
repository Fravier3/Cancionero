// Calendar dates use local noon, never UTC midnight (which can change the day).
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function parseDate(key) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
  const [y,m,d]=key.split('-').map(Number), date=new Date(y,m-1,d,12);
  return dateKey(date)===key?date:null;
}
export function sundayFor(date=new Date()) {
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
  d.setDate(d.getDate()+(7-d.getDay())%7);return dateKey(d);
}
export function shiftSunday(key,weeks) {const d=parseDate(key);d.setDate(d.getDate()+weeks*7);return dateKey(d);}
export function sundayLabel(key) {return parseDate(key)?.toLocaleDateString('es-PR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})||key;}
