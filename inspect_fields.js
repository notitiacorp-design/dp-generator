const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function inspectCerfa() {
  const pdfBytes = fs.readFileSync('templates/cerfa_13404.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  console.log('Total pages:', pdfDoc.getPageCount());
  console.log('Total form fields:', fields.length);
  const names = fields.map(f => f.getName());
  fs.writeFileSync('fields.json', JSON.stringify(names, null, 2));
  console.log('Sample fields:', names.slice(0, 40));
}
inspectCerfa().catch(console.error);
