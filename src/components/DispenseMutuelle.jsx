import React, { useRef, useEffect, useState } from 'react';
import jsPDF from 'jspdf';

// Attestation de dispense d'adhesion a la mutuelle d'entreprise, signee electroniquement (signature manuscrite dessinee)
export const EMPLOYEUR = 'Camping Le Bout du Monde, 2 chemin de Rhodes, 11400 Verdun-en-Lauragais';

export function dispenseText({ fullName, motif, organisme }) {
  return [
    'Je soussigne(e) ' + (fullName || '...') + ', demande a etre dispense(e) d\'adherer au regime collectif et obligatoire '
      + 'de complementaire sante (mutuelle) mis en place par mon employeur, ' + EMPLOYEUR + '.',
    'Motif de la dispense : ' + (motif || '...') + '.',
    'Organisme assurant ma couverture actuelle : ' + (organisme || '...') + '.',
    'Je certifie sur l\'honneur l\'exactitude de ces informations. Je m\'engage a fournir le justificatif de ma couverture '
      + 'lorsque mon motif de dispense l\'exige, et chaque annee si necessaire, et a informer mon employeur de tout changement '
      + 'de situation.',
    'J\'ai ete informe(e) des consequences de ce choix : je ne beneficierai pas des garanties du contrat collectif ni de la '
      + 'participation de l\'employeur a la cotisation tant que la dispense s\'applique.',
  ];
}

// Zone de signature (souris, doigt ou stylet). onChange recoit une image PNG (data URL) ou null si effacee.
export function SignaturePad({ onChange, color }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1A1D27';
  }, []);

  function point(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function start(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d'); const p = point(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d'); const p = point(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    if (empty) setEmpty(false);
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (!empty) onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clear() {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setEmpty(true); onChange(null);
  }

  return (
    <div>
      <canvas ref={canvasRef}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
        style={{ width: '100%', height: '150px', background: '#fff', border: '2px dashed ' + (empty ? '#E2E5ED' : (color || '#16A34A')), borderRadius: '8px', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#6B7280' }}>
        <span>{empty ? 'Signez dans le cadre ci-dessus (doigt ou souris)' : '✓ Signature enregistree'}</span>
        <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#6C5FCD', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', textDecoration: 'underline' }}>Effacer</button>
      </div>
    </div>
  );
}

// Genere le PDF de l'attestation signee (Blob)
export function buildDispensePdf({ fullName, email, motif, organisme, signature }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = pdf.internal.pageSize.getWidth();
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const timeStr = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
  pdf.text('Demande de dispense d\'adhesion', w / 2, 25, { align: 'center' });
  pdf.text('au regime de complementaire sante obligatoire', w / 2, 32, { align: 'center' });

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  pdf.text('Employeur : ' + EMPLOYEUR, 20, 46);
  pdf.text('Salarie(e) : ' + fullName + (email ? ' (' + email + ')' : ''), 20, 52);

  pdf.setFontSize(11);
  let y = 66;
  dispenseText({ fullName, motif, organisme }).forEach(par => {
    const lines = pdf.splitTextToSize(par, w - 40);
    pdf.text(lines, 20, y);
    y += lines.length * 6 + 4;
  });

  y += 6;
  pdf.text('Fait a Verdun-en-Lauragais, le ' + dateStr + '.', 20, y);
  y += 10;
  pdf.text('Signature :', 20, y);
  pdf.addImage(signature, 'PNG', 20, y + 3, 70, 30);

  pdf.setFontSize(8); pdf.setTextColor(110);
  pdf.text(pdf.splitTextToSize('Document signe electroniquement via l\'application Planning HPA le ' + dateStr + ' a ' + timeStr
    + ' (heure de Paris) par ' + fullName + (email ? ', compte ' + email : '') + '.', w - 40), 20, 280);

  return pdf.output('blob');
}
