/* JSONL reader shared by the Node mirrors of the Cloudflare functions (local runs only). */
import { promises as fs } from 'node:fs';

export async function readRows(file: string) {
  let text = ''; try { text = await fs.readFile(file, 'utf8'); } catch { return []; }
  const rows: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch { /* skip */ } }
  return rows;
}
