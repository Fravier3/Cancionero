const base = 'https://bible.usccb.org/es/bible/lecturas/';

const celebrations = {
  '2026-11-26': {
    title: 'Día de Acción de Gracias',
    url: base + '112626-Thanksgiving',
  },
  '2026-12-25': {
    title: 'Navidad · Misa del día',
    url: base + '122526-Day.cfm',
  },
  '2027-01-01': {
    title: 'Santa María, Madre de Dios',
    url: base + '010127.cfm',
  },
  '2027-01-06': {
    title: 'Epifanía del Señor',
    // The readings are the same as those published for Epiphany on January 3
    // in the USCCB calendar. Puerto Rico celebrates it on January 6.
    url: base + '010327.cfm',
  },
};

export function specialReadingsFor(date) {
  return Object.hasOwn(celebrations,date)?celebrations[date]:null;
}
