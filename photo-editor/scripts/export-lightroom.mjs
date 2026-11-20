// Build a Lightroom bundle (.zip) with all built-in looks, Fuji recipes and film profiles.
// Usage: node scripts/export-lightroom.mjs <out.zip>
import { writeFileSync } from 'node:fs';
import { BUILTIN_PRESETS } from '../src/presets.js';
import { RECIPES, effectiveParams, recipeSummary } from '../src/recipes.js';
import { PROFILES, buildProfileLUT } from '../src/profiles.js';
import { defaultParams, clone } from '../src/params.js';
import { paramsToXmp, lutToCube, makeZip, README_LR } from '../src/lrexport.js';

const out = process.argv[2] || 'fuji-raw-editor-lightroom.zip';
const safe = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
const profName = (id) => (PROFILES[id] ? safe(PROFILES[id].name.replace(' (phong cách)', '')) + '.cube' : id);
const files = [{ name: 'HUONG-DAN.txt', data: README_LR }];
const list = [];

BUILTIN_PRESETS.forEach((pr, i) => {
  const p = effectiveParams(Object.assign(defaultParams(), clone(pr.params)));
  const name = `${String(i + 1).padStart(2, '0')} ${pr.name}`;
  const { xmp, notes } = paramsToXmp(name, p, { group: 'Fuji RAW Editor - Kieu', profileNote: p.profile && profName(p.profile) });
  files.push({ name: `Presets/Kieu/${safe(name)}.xmp`, data: xmp });
  list.push(`Kieu  | ${name}${p.profile ? '  -> profile ' + profName(p.profile) : ''}${notes.length ? '\n        ' + notes.join('\n        ') : ''}`);
});
RECIPES.forEach((r, i) => {
  const p = effectiveParams(Object.assign(defaultParams(), { recipe: clone(r) }));
  const name = `${String(i + 1).padStart(2, '0')} ${r.name}`;
  const { xmp, notes } = paramsToXmp(name, p, { group: 'Fuji RAW Editor - Cong thuc Fuji', profileNote: profName(p.profile) });
  files.push({ name: `Presets/Cong-thuc-Fuji/${safe(name)}.xmp`, data: xmp });
  list.push(`Fuji  | ${name}  -> profile ${profName(p.profile)}\n        ${recipeSummary(r)}${notes.length ? '\n        ' + notes.join('\n        ') : ''}`);
});
for (const id of Object.keys(PROFILES)) files.push({ name: `Profiles/${profName(id)}`, data: lutToCube(buildProfileLUT(id), PROFILES[id].name) });
files.push({ name: 'DANH-SACH.txt', data: 'DANH SACH PRESET VA PROFILE DI KEM\n==================================\n\n' + list.join('\n\n') + '\n' });
writeFileSync(out, makeZip(files));
console.log(out, files.length, 'files');
