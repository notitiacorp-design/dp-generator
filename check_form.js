import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';

async function inspectForm() {
  const bytes = fs.readFileSync('templates/cerfa_13404.pdf');
  const doc = await PDFDocument.load(bytes);
  try {
    const form = doc.getForm();
    const fields = form.getFields();
    console.log(`Found ${fields.length} form fields!`);
    const fieldNames = fields.map(f => `${f.getName()} (${f.constructor.name})`);
    fs.writeFileSync('form_fields.txt', fieldNames.join('\n'));
    console.log('Written field names to form_fields.txt');
  } catch (e) {
    console.log('Error accessing getForm():', e.message);
  }
}

inspectForm();
