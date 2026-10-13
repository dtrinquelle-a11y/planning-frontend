import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';
import { PDFDocument } from 'pdf-lib';

// Bulletins de paie groupes : un PDF unique (tous les salaries) -> un PDF par salarie.
// La lecture se fait dans le navigateur : le fichier complet n'est jamais envoye.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const norm = s => ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';

// Texte de chaque page (normalise) et chiffres (pour le numero de securite sociale)
export async function readPages(arrayBuffer) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const raw = content.items.map(it => it.str).join(' ');
    pages.push({ text: norm(raw), digits: raw.replace(/\D/g, ''), empty: !raw.trim() });
  }
  return pages;
}

// Salarie reconnu sur une page : numero de securite sociale (le plus sur), sinon nom + prenom
function matchPage(page, emps) {
  const found = [];
  for (const e of emps) {
    const nss = String(e.nss || '').replace(/\D/g, '').slice(0, 13);
    if (nss.length === 13 && page.digits.includes(nss)) { found.push({ e, score: 3 }); continue; }
    const last = norm(e.last_name), first = norm(e.first_name);
    if (last.trim().length < 2 || first.trim().length < 2) continue;
    if (page.text.includes(last) && page.text.includes(first)) {
      // "NOM PRENOM" ou "PRENOM NOM" cote a cote : plus sur que deux mots disperses
      const adjacent = page.text.includes(last.trimEnd() + first) || page.text.includes(first.trimEnd() + last);
      found.push({ e, score: adjacent ? 2 : 1, pos: page.text.indexOf(last) });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score || (a.pos ?? 0) - (b.pos ?? 0));
  return { employee: found[0].e, ambiguous: found.length > 1 && found[1].score === found[0].score };
}

// Attribution page par page : une page sans nom reconnu est la suite du bulletin precedent (bulletin sur 2 pages)
export function assignPages(pages, emps) {
  let prev = null;
  return pages.map((p, i) => {
    const m = matchPage(p, emps);
    if (m) { prev = m.employee.id; return { page: i, employeeId: m.employee.id, how: m.ambiguous ? 'ambigu' : 'reconnu' }; }
    if (prev) return { page: i, employeeId: prev, how: 'suite' };
    return { page: i, employeeId: '', how: 'inconnu' };
  });
}

// Pages consecutives d'un meme salarie -> un bulletin
export function groupPages(assignments) {
  const groups = [];
  assignments.forEach(a => {
    const last = groups[groups.length - 1];
    if (a.employeeId && last && last.employeeId === a.employeeId && last.pages[last.pages.length - 1] === a.page - 1) last.pages.push(a.page);
    else if (a.employeeId) groups.push({ employeeId: a.employeeId, pages: [a.page] });
  });
  return groups;
}

// PDF contenant seulement les pages donnees (index a partir de 0)
export async function extractPages(source, pageIndexes) {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, pageIndexes);
  copied.forEach(p => out.addPage(p));
  return out.save();
}

export const loadPdf = arrayBuffer => PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
