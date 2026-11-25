// Calendar dates use local noon, never UTC midnight (which can change the day).
const specialMassDates = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-06'];

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

export function isSpecialMassDate(key) {
  return specialMassDates.includes(key);
}

export function massDateFor(date=new Date()) {
  const today=dateKey(date), sunday=sundayFor(date);
  return specialMassDates.find(key=>key>=today&&key<sunday)??sunday;
}

export function massDateFromPicker(key) {
  if(isSpecialMassDate(key))return key;
  const date=parseDate(key);
  return date?sundayFor(date):null;
}

export function adjacentMassDate(key,direction) {
  const date=parseDate(key);
  date.setDate(date.getDate()+direction);
  if(direction===1)return massDateFor(date);

  const end=dateKey(date);
  date.setDate(date.getDate()-date.getDay());
  const sunday=dateKey(date);
  let previous=sunday;
  for(const day of specialMassDates)if(day<=end&&day>previous)previous=day;
  return previous;
}
