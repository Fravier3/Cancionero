import {MOMENTS} from './mass-plan.js';
import {searchText} from './search.js';
const aliases={'piedad':'Ten piedad','senor ten piedad':'Ten piedad','aleluya':'Interleccional','cordero de dios':'Cordero','salida':'Despedida'};
export function massMoment(categories=[]){
 for(const category of categories){const label=searchText(category).trim();const match=MOMENTS.find(m=>searchText(m)===label)||aliases[label];if(match)return match;}
 return '';
}
