// Writes public/data/dictionary.csv and dictionary.json from lib/survey.ts (the one definition of the instrument).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dictionary } from '../lib/survey.ts';
const rows = dictionary();
const esc = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/dictionary.csv', ['file,field,type,values,note', ...rows.map((r) => [r.file, r.field, r.type, r.values, r.note].map(esc).join(','))].join('\n') + '\n');
writeFileSync('public/data/dictionary.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), rows }, null, 1));
console.log('dictionary:', rows.length, 'rows');
