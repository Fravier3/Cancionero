import test from 'node:test';
import assert from 'node:assert/strict';
import {massMoment} from '../js/quick-mass.js';
import {MOMENTS} from '../js/mass-plan.js';
import {sundayFor} from '../js/dates.js';
test('uses actual Mass moments and maps legacy category names',()=>{
 for(const moment of MOMENTS)assert.equal(massMoment([moment]),moment);
 for(const [category,moment] of [['Piedad','Ten piedad'],['Aleluya','Interleccional'],['Cordero de Dios','Cordero'],['Salida','Despedida'],['comunion','Comunión']])assert.equal(massMoment([category]),moment);
});
test('missing or unrelated categories prompt; multiple categories use first valid Mass category',()=>{
 assert.equal(massMoment([]),'');assert.equal(massMoment(['Navidad']),'');
 assert.equal(massMoment(['Navidad','Santo','Comunión']),'Santo');
});
test('Monday through Saturday target the coming Sunday; Sunday uses today',()=>{
 for(let day=9;day<=15;day++)assert.equal(sundayFor(new Date(2026,10,day,12)),'2026-11-15');
});
