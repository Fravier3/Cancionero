import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { sundayFor, shiftSunday, parseDate, massDateFor, massDateFromPicker, adjacentMassDate, isSpecialMassDate } from '../js/dates.js';
import {specialReadingsFor} from '../backend/special-readings.js';
import {lectionaryFor} from '../js/lectionary.js';
import { layoutLyrics } from '../js/ocr-layout.js';

test('Saturday preparation and Sunday use resolve to the same date',()=>{
  assert.equal(sundayFor(new Date(2026,9,31,18)), '2026-11-01');
  assert.equal(sundayFor(new Date(2026,10,1,23)), '2026-11-01');
  assert.equal(sundayFor(new Date(2026,10,2,0)), '2026-11-08');
  assert.equal(shiftSunday('2026-12-27',1),'2027-01-03');
  assert.equal(parseDate('2026-02-30'),null);
});

test('Special Mass dates are selectable and sit between the surrounding Sundays',()=>{
  const celebrations=[
    ['2026-11-22','2026-11-26','2026-11-29'],
    ['2026-12-20','2026-12-25','2026-12-27'],
    ['2026-12-27','2027-01-01','2027-01-03'],
    ['2027-01-03','2027-01-06','2027-01-10'],
  ];
  for(const [before,special,after] of celebrations){
    assert.equal(massDateFromPicker(special),special);
    assert.equal(adjacentMassDate(before,1),special);
    assert.equal(adjacentMassDate(special,1),after);
    assert.equal(adjacentMassDate(after,-1),special);
    assert.equal(adjacentMassDate(special,-1),before);
    assert.equal(massDateFor(parseDate(special)),special);
    assert.equal(massDateFor(parseDate(before)),before);
    assert.equal(massDateFor(parseDate(after)),after);
  }
});

test('The default opens the next Mass and exceptions do not repeat annually',()=>{
  assert.equal(massDateFor(parseDate('2026-11-25')),'2026-11-26');
  assert.equal(massDateFor(parseDate('2026-11-27')),'2026-11-29');
  assert.equal(massDateFor(parseDate('2027-01-05')),'2027-01-06');
  assert.equal(massDateFor(parseDate('2027-01-07')),'2027-01-10');
  assert.equal(massDateFromPicker('2026-11-25'),'2026-11-29');
  assert.equal(massDateFromPicker('2026-02-30'),null);
  assert.equal(massDateFromPicker('2027-12-25'),'2027-12-26');
  assert.equal(massDateFromPicker('2028-01-01'),'2028-01-02');
  assert.equal(massDateFromPicker('2028-01-06'),'2028-01-09');
});

test('Each special Mass has its own complete reading set and a liturgical source',()=>{
  const readings=JSON.parse(readFileSync(new URL('../js/special-mass-passages.json',import.meta.url),'utf8'));
  const expected={
    '2026-11-26':['Mateo 7, 7-11',3],
    '2026-12-25':['Juan 1, 1-18',4],
    '2027-01-01':['Lucas 2, 16-21',4],
    '2027-01-06':['Mateo 2, 1-12',4],
  };
  assert.deepEqual(Object.keys(readings),Object.keys(expected));
  for(const [date,[gospel,count]] of Object.entries(expected)){
    assert.ok(isSpecialMassDate(date));
    assert.ok(specialReadingsFor(date)?.url);
    assert.equal(readings[date].length,count);
    assert.equal(readings[date].at(-1).title,gospel);
    assert.match(readings[date][1].text,/^R\. /);
    assert.ok(readings[date].every(reading=>reading.text.trim().length>0));
  }
  assert.equal(specialReadingsFor('2027-01-03'),null);
});

test('Lectionary links distinguish Puerto Rico celebrations and Sunday dates',()=>{
  const paths={
    '2026-11-26':'/EnC-2026-11-26',
    '2026-11-29':'/liturgia/ba1.pdf',
    '2026-12-25':'/es/bible/lecturas/122526-Day.cfm',
    '2026-12-27':'/es/bible/lecturas/122726.cfm',
    '2027-01-01':'/es/bible/lecturas/010127.cfm',
    '2027-01-03':'/liturgia/an2.pdf',
    '2027-01-06':'/liturgia/bepifania.pdf',
    '2029-01-07':'/liturgia/abautismo.pdf',
  };
  for(const [date,path] of Object.entries(paths))assert.equal(new URL(lectionaryFor(date).url).pathname,path);
  assert.equal(lectionaryFor('2027-01-03').differentCalendar,true);
  assert.equal(lectionaryFor('2027-02-29'),null);
});

test('OCR retains line boundaries, stanza gaps, indents and wide word spaces',()=>{
  const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const word=(line,n,x,y,text)=>`5\t1\t1\t1\t${line}\t${n}\t${x}\t${y}\t${text.length*10}\t20\t95\t${text}`;
  const tsv=[header,word(1,1,10,10,'Canta'),word(1,2,70,10,'hoy'),word(2,1,10,40,'Con'),word(2,2,50,40,'amor'),word(3,1,30,100,'Luz'),word(3,2,90,100,'y'),word(3,3,110,100,'paz')].join('\n');
  assert.equal(layoutLyrics({tsv}), 'Canta hoy\nCon amor\n\n  Luz   y paz');
  assert.equal(layoutLyrics({text:'uno\r\n\r\n\r\ndos\n'}),'uno\n\n\ndos');
});
