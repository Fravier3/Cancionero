export function categoryIds(song){return [...new Set(song.categoryIds??song.category_ids??(song.categoryId!=null?[song.categoryId]:song.category_id!=null?[song.category_id]:[]))];}
export function categoryLabels(song,categories){const ids=new Set(categoryIds(song).map(String));return categories.filter(c=>ids.has(String(c.id))).map(c=>c.name);}
