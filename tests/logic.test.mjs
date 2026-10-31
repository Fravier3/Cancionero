import test from 'node:test';
import assert from 'node:assert/strict';
import { sundayFor, shiftSunday, parseDate } from '../js/dates.js';
import { layoutLyrics } from '../js/ocr-layout.js';

test('Saturday preparation and Sunday use resolve to the same date',()=>{
  assert.equal(sundayFor(new Date(2026,9,31,18)), '2026-11-01');
  assert.equal(sundayFor(new Date(2026,10,1,23)), '2026-11-01');
  assert.equal(sundayFor(new Date(2026,10,2,0)), '2026-11-08');
  assert.equal(shiftSunday('2026-12-27',1),'2027-01-03');
  assert.equal(parseDate('2026-02-30'),null);
});

test('OCR retains line boundaries, stanza gaps, indents and wide word spaces',()=>{
  const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const word=(line,n,x,y,text)=>`5\t1\t1\t1\t${line}\t${n}\t${x}\t${y}\t${text.length*10}\t20\t95\t${text}`;
  const tsv=[header,word(1,1,10,10,'Canta'),word(1,2,70,10,'hoy'),word(2,1,10,40,'Con'),word(2,2,50,40,'amor'),word(3,1,30,100,'Luz'),word(3,2,90,100,'y'),word(3,3,110,100,'paz')].join('\n');
  assert.equal(layoutLyrics({tsv}), 'Canta hoy\nCon amor\n\n  Luz   y paz');
  assert.equal(layoutLyrics({text:'uno\r\n\r\n\r\ndos\n'}),'uno\n\n\ndos');
});
