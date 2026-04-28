import * as XLSX from 'xlsx';

export interface SeedRecord {
  cultivar: string;
  lote: string;
  seqProducao: number;
  vigor: number;
  viabilidade: number;
  areia: number;
  bags: number;
  empresa: string;
  EA72: number;
}

export function parseExcelOrCsv(buffer: ArrayBuffer): SeedRecord[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Parse to an array of arrays first to handle header finding robustly
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const records: SeedRecord[] = [];
  let currentCultivar = 'Desconhecida';
  
  // Find where the actual table headers start
  let headerRowIndex = -1;
  const targetHeaders = ['lote', 'vigor', 'viabilidade', 'areia'];
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;
    
    // Check if this row states the cultivar like "Cultivar: 80KA72"
    const firstCellStr = String(row[0]).trim();
    if (firstCellStr.toLowerCase().startsWith('cultivar')) {
      const parts = firstCellStr.split(':');
      if (parts.length > 1) {
        currentCultivar = parts[1].trim();
      } else if (row.length > 1 && row[1]) {
        currentCultivar = String(row[1]).trim();
      }
    }
    
    // Check if this is the header row
    const rowStrings = row.map(cell => String(cell).toLowerCase().trim());
    const hasManyTargets = targetHeaders.filter(t => rowStrings.some(c => c.includes(t))).length >= 2;
    if (hasManyTargets && headerRowIndex === -1) {
      headerRowIndex = i;
      // We found the header, but wait, maybe cultivar is defined later per row.
      // We will map column indexes
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Não foi possível encontrar o cabeçalho com colunas como Lote, Vigor, Viabilidade, Areia.');
  }

  const headerRow = rawData[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
  const colLote = headerRow.findIndex(h => h.includes('lote'));
  const colVigor = headerRow.findIndex(h => h.includes('vigor'));
  const colViab = headerRow.findIndex(h => h.includes('viab'));
  const colAreia = headerRow.findIndex(h => h.includes('areia'));
  const colCultivar = headerRow.findIndex(h => h.includes('cultivar'));
  
  let colBags = headerRow.findIndex(h => h.includes('bag') || h.includes('saca') || h.includes('repres_original'));
  if (colBags === -1) colBags = 7; // Coluna H
  
  let colEmpresa = headerRow.findIndex(h => h.includes('empresa') || h.includes('cliente'));
  if (colEmpresa === -1) colEmpresa = 1; // Coluna B

  // Procurar a coluna exata "ea72_normais_r1"
  let colEA72 = headerRow.findIndex(h => {
    const text = String(h).toLowerCase().trim();
    return text === 'ea72_normais_r1' || text.includes('ea72_normais_r1') || text.includes('ea72_normais_r1 (bl)');
  });

  // Fallback explicitly to column BL (index 63) se não encontrar a coluna com o nome exato
  if (colEA72 === -1) {
    colEA72 = 63; 
  }

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Is it a new cultivar definition mid-sheet?
    const firstCellStr = String(row[0] || '').trim();
    if (firstCellStr.toLowerCase().startsWith('cultivar')) {
      const parts = firstCellStr.split(':');
      if (parts.length > 1) {
        currentCultivar = parts[1].trim();
        continue;
      }
    }

    const loteVal = row[colLote];
    if (!loteVal || typeof loteVal !== 'string' && typeof loteVal !== 'number') continue;
    
    const loteStr = String(loteVal).trim();
    if (loteStr.toLowerCase() === 'média' || loteStr.toLowerCase() === 'total') continue;

    // extract seqProducao (last 4 digits)
    let seqProducao = 0;
    const matches = loteStr.match(/\d+$/);
    if (matches) {
       const digits = matches[0];
       seqProducao = parseInt(digits.slice(-4), 10);
    }

    let cultivar = currentCultivar;
    if (colCultivar !== -1 && row[colCultivar]) {
      cultivar = String(row[colCultivar]).trim();
    }

    // safely parse numbers
    const num = (val: any) => {
      if (val === undefined || val === null || val === '') return null;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(',', '.'));
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    let ea72Raw = num(row[colEA72]);

    records.push({
      cultivar,
      lote: loteStr,
      seqProducao,
      vigor: num(row[colVigor]) || 0,
      viabilidade: num(row[colViab]) || 0,
      areia: num(row[colAreia]) || 0,
      bags: num(row[colBags]) || 0,
      empresa: colEmpresa !== -1 && row[colEmpresa] ? String(row[colEmpresa]).trim() : 'Não informada',
      EA72: ea72Raw,
    });
  }

  // Filter out any completely empty/zero records if any
  return records.filter(r => r.lote && (r.vigor > 0 || r.viabilidade > 0 || r.areia > 0));
}
