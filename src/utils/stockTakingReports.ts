import { roundStockQuantity } from '../types';
import { addOfficialHeaderToPdf } from './logo';

export interface StockTakeEntryRow {
  inventoryId: string;
  name: string;
  category: string;
  department: string;
  location?: string;
  itemTypeLabel: string;
  unit: string;
  systemQty: number;
  damagedQty: number;
  physicalQty: number | null;
  variance: number | null;
  remarks: string;
}

export async function generateStockTakingPdf(options: {
  rows: StockTakeEntryRow[];
  departmentName: string;
  categoryLabel?: string;
  countDateLabel: string;
  conductedByLabel?: string;
  blankMode?: boolean;
}): Promise<void> {
  const {
    rows,
    departmentName,
    categoryLabel,
    countDateLabel,
    conductedByLabel,
    blankMode = false,
  } = options;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const countedRows = blankMode ? [] : rows.filter((r) => r.physicalQty !== null);
  const matchedCount = countedRows.filter((r) => r.variance === 0).length;
  const shortageCount = countedRows.filter((r) => (r.variance || 0) < 0).length;
  const surplusCount = countedRows.filter((r) => (r.variance || 0) > 0).length;
  const scopeText =
    categoryLabel && categoryLabel !== 'All'
      ? `${departmentName} · ${categoryLabel}`
      : departmentName;

  const startY = await addOfficialHeaderToPdf(doc, {
    title: blankMode
      ? `${departmentName.toUpperCase()} — DEPARTMENTAL STOCK TAKING SHEET`
      : `${departmentName.toUpperCase()} — DEPARTMENTAL STOCK TAKING REPORT`,
    subtitle: `Department: ${scopeText}  |  Stock Take Date: ${countDateLabel}${
      conductedByLabel ? `  |  Conducted By (HOD): ${conductedByLabel}` : ''
    }`,
  });

  const summaryRows = blankMode
    ? [[scopeText, String(rows.length), countDateLabel, 'Departmental Physical Count (Blank Write-In Sheet)']]
    : [
        [
          scopeText,
          String(rows.length),
          `${countedRows.length} / ${rows.length}`,
          `${matchedCount} Match · ${shortageCount} Short · ${surplusCount} Surplus`,
        ],
      ];

  doc.autoTable({
    startY: startY + 1,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    head: blankMode
      ? [['Department / Filter', 'Total Line Items', 'Count Date', 'Mode']]
      : [['Department / Filter', 'Total Line Items', 'Items Counted', 'Variance Summary']],
    body: summaryRows,
  });

  const tableStartY = (doc.autoTable.previous?.finalY || startY + 18) + 5;

  const head = [
    [
      '#',
      'Item Name',
      'Category / Type',
      'Unit',
      'System Qty',
      'Physical Count (Actual)',
      'Variance (+/-)',
      'Condition / Remarks',
    ],
  ];

  const body = rows.map((row, index) => {
    const catType = [row.category || 'General', row.itemTypeLabel].filter(Boolean).join(' · ');
    const itemDesc = row.location ? `${row.name}\nLoc: ${row.location}` : row.name;
    const sysQtyText =
      row.damagedQty > 0
        ? `${roundStockQuantity(row.systemQty)}\n(${roundStockQuantity(row.damagedQty)} dmg)`
        : String(roundStockQuantity(row.systemQty));

    if (blankMode || row.physicalQty === null) {
      return [
        index + 1,
        itemDesc,
        catType,
        row.unit,
        sysQtyText,
        '',
        '',
        blankMode ? '' : row.remarks || '',
      ];
    }

    const v = roundStockQuantity(row.variance || 0);
    const varianceStr = v > 0 ? `+${v}` : v < 0 ? `${v}` : '0';

    return [
      index + 1,
      itemDesc,
      catType,
      row.unit,
      sysQtyText,
      String(roundStockQuantity(row.physicalQty)),
      varianceStr,
      row.remarks || '',
    ];
  });

  doc.autoTable({
    startY: tableStartY,
    head,
    body,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3.2, right: 2.5, bottom: 3.2, left: 2.5 },
      minCellHeight: 9.5,
      valign: 'middle',
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 64 },
      2: { cellWidth: 46 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 32, halign: 'right', fillColor: [248, 250, 252] },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 'auto' },
    },
    didParseCell: (data: {
      section: string;
      column: { index: number };
      cell: { text: string[]; styles: { textColor?: number[]; fontStyle?: string } };
    }) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = (data.cell.text?.[0] || '').trim();
        if (val.startsWith('-')) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        } else if (val.startsWith('+')) {
          data.cell.styles.textColor = [4, 120, 87];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  let signY = (doc.autoTable.previous?.finalY || tableStartY + 20) + 12;
  if (signY + 32 > pageHeight - 12) {
    doc.addPage();
    signY = 24;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Departmental Stock Taking Sign-Off (${departmentName}):`, marginX, signY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Stock Taken By (HOD / Dept Rep & Sign): .................................', marginX, signY + 10);
  doc.text('Date: ..............................', pageWidth - marginX - 58, signY + 10);
  doc.text('Witnessed By (Department Staff): ..........................................', marginX, signY + 20);
  doc.text('Received By (Procurement / Principal): .................................', pageWidth / 2, signY + 20);

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Eldama Ravine TVC SMS · ${departmentName} Stock Taking · Page ${i} of ${pageCount}`,
      pageWidth - marginX,
      pageHeight - 8,
      { align: 'right' },
    );
  }

  const filePrefix = blankMode ? 'ERTVC_Dept_Stock_Taking_Sheet' : 'ERTVC_Dept_Stock_Taking_Report';
  const safeScope = scopeText.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${filePrefix}_${safeScope}_${new Date().toISOString().split('T')[0]}.pdf`);
}
