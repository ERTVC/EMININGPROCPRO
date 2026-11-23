import { DepartmentBudget } from '../types';
import { formatKes } from './igaReports';
import { addOfficialHeaderToPdf } from './logo';

export async function generateDepartmentBudgetPdf(budget: DepartmentBudget): Promise<void> {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const bodyStartY = await addOfficialHeaderToPdf(doc, {
    title: `${budget.department.toUpperCase()} — FY ${budget.financialYear} PROCUREMENT BUDGET`,
    subtitle: budget.title,
  });

  const submittedDate = budget.submittedAt
    ? new Date(budget.submittedAt).toLocaleDateString()
    : 'Draft (Not yet submitted)';

  doc.autoTable({
    startY: bodyStartY,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    head: [['Department', 'Financial Year', 'Status', 'Prepared By', 'Submitted On', 'Total Estimate']],
    body: [
      [
        budget.department,
        budget.financialYear,
        budget.status,
        `${budget.submittedByName}\n(${budget.submittedByEmail})`,
        submittedDate,
        formatKes(budget.totalAmount),
      ],
    ],
  });

  if (budget.notes) {
    const notesY = (doc.autoTable.previous?.finalY || bodyStartY + 20) + 6;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Department Budget Justification / Notes:', 14, notesY);
    doc.setFont('helvetica', 'normal');
    const wrappedNotes = doc.splitTextToSize(budget.notes, pageWidth - 28);
    doc.text(wrappedNotes, 14, notesY + 5);
  }

  // Category Breakdown Table
  const categoryTotals = new Map<string, { count: number; total: number }>();
  for (const item of budget.lineItems) {
    const current = categoryTotals.get(item.category) || { count: 0, total: 0 };
    current.count += 1;
    current.total += item.totalCost || 0;
    categoryTotals.set(item.category, current);
  }

  const catStartY =
    (doc.autoTable.previous?.finalY || bodyStartY + 25) + (budget.notes ? 20 : 8);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Category Allocation Summary', 14, catStartY);

  doc.autoTable({
    startY: catStartY + 3,
    theme: 'grid',
    headStyles: { fillColor: [3, 105, 161] },
    head: [['Votehead / Category', 'Line Items', 'Subtotal (KES)', '% Share']],
    body: Array.from(categoryTotals.entries()).map(([cat, info]) => [
      cat,
      info.count,
      formatKes(info.total),
      budget.totalAmount > 0 ? `${((info.total / budget.totalAmount) * 100).toFixed(1)}%` : '0.0%',
    ]),
  });

  // Itemized Schedule
  const itemsStartY = (doc.autoTable.previous?.finalY || catStartY + 30) + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Itemized Financial Year Budget Schedule', 14, itemsStartY);

  const itemRows = budget.lineItems.map((line, idx) => [
    idx + 1,
    line.category,
    line.itemName,
    line.unit,
    line.quantity,
    formatKes(line.estimatedUnitCost),
    formatKes(line.totalCost),
    line.justification || '-',
  ]);
  itemRows.push([
    '',
    '',
    'GRAND TOTAL',
    '',
    '',
    '',
    formatKes(budget.totalAmount),
    '',
  ]);

  doc.autoTable({
    startY: itemsStartY + 3,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    head: [['#', 'Category', 'Item / Description', 'Unit', 'Qty', 'Unit Cost', 'Total (KES)', 'Justification']],
    body: itemRows,
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.row.index === itemRows.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // Review Remarks & Signature Block
  let signY = (doc.autoTable.previous?.finalY || 200) + 10;
  if (signY > doc.internal.pageSize.getHeight() - 48) {
    doc.addPage();
    signY = 22;
  }

  if (budget.reviewNotes || budget.reviewedByEmail) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Store / Admin Review (${budget.status}${budget.reviewedByEmail ? ` · ${budget.reviewedByEmail}` : ''}):`,
      14,
      signY,
    );
    doc.setFont('helvetica', 'normal');
    doc.text(
      doc.splitTextToSize(budget.reviewNotes || 'No remarks provided.', pageWidth - 28),
      14,
      signY + 5,
    );
    signY += 16;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Approval & Verification Sign-Off:', 14, signY);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `HOD (${budget.department}): _________________________   Date: ____________`,
    14,
    signY + 10,
  );
  doc.text(
    'Store / Procurement Officer: ____________________   Date: ____________',
    14,
    signY + 20,
  );
  doc.text(
    'Principal / Finance Admin: ______________________   Date: ____________',
    14,
    signY + 30,
  );

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' },
    );
  }

  const deptSlug = budget.department.replace(/[^a-zA-Z0-9]+/g, '_');
  const fySlug = budget.financialYear.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`ERTVC_Budget_${deptSlug}_FY_${fySlug}.pdf`);
}

export async function generateConsolidatedBudgetPdf(
  budgets: DepartmentBudget[],
  financialYear: string,
): Promise<void> {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const scoped =
    financialYear === 'All'
      ? budgets
      : budgets.filter((b) => b.financialYear.trim() === financialYear.trim());

  const bodyStartY = await addOfficialHeaderToPdf(doc, {
    title:
      financialYear === 'All'
        ? 'CONSOLIDATED DEPARTMENTAL PROCUREMENT BUDGETS'
        : `CONSOLIDATED FY ${financialYear} DEPARTMENTAL BUDGETS`,
    subtitle: 'Procurement Office & Institutional Budget Summary',
  });

  const grandTotal = scoped.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const approvedTotal = scoped
    .filter((b) => b.status === 'Approved')
    .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  doc.autoTable({
    startY: bodyStartY,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    head: [['Financial Year', 'Departments Submitted', 'Approved Value', 'Total Requested Value']],
    body: [
      [
        financialYear === 'All' ? 'All Years' : financialYear,
        scoped.length,
        formatKes(approvedTotal),
        formatKes(grandTotal),
      ],
    ],
  });

  const tableStartY = (doc.autoTable.previous?.finalY || bodyStartY + 20) + 8;
  const rows = scoped.map((b, idx) => [
    idx + 1,
    b.department,
    b.financialYear,
    b.title,
    b.lineItems.length,
    b.status,
    b.submittedByName,
    formatKes(b.totalAmount),
  ]);
  rows.push(['', '', '', 'TOTAL INSTITUTIONAL BUDGET', '', '', '', formatKes(grandTotal)]);

  doc.autoTable({
    startY: tableStartY,
    theme: 'grid',
    headStyles: { fillColor: [3, 105, 161], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    head: [['#', 'Department', 'FY', 'Budget Title', 'Items', 'Status', 'Submitted By', 'Amount (KES)']],
    body:
      scoped.length > 0
        ? rows
        : [['-', 'No budgets submitted for this filter', '-', '-', '-', '-', '-', formatKes(0)]],
    didParseCell: (hookData: any) => {
      if (scoped.length > 0 && hookData.section === 'body' && hookData.row.index === rows.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' },
    );
  }

  const fySlug =
    financialYear === 'All' ? 'All_Years' : financialYear.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`ERTVC_Consolidated_Budgets_${fySlug}.pdf`);
}

export function downloadDepartmentBudgetExcel(budget: DepartmentBudget): void {
  const rows = budget.lineItems.map((line, index) => ({
    '#': index + 1,
    Department: budget.department,
    'Financial Year': budget.financialYear,
    Category: line.category,
    'Item / Description': line.itemName,
    Unit: line.unit,
    Quantity: line.quantity,
    'Estimated Unit Cost (KES)': line.estimatedUnitCost,
    'Total Cost (KES)': line.totalCost,
    Justification: line.justification || '',
  }));
  rows.push({
    '#': budget.lineItems.length + 1,
    Department: budget.department,
    'Financial Year': budget.financialYear,
    Category: 'Other',
    'Item / Description': 'GRAND TOTAL',
    Unit: '',
    Quantity: budget.lineItems.reduce((s, l) => s + l.quantity, 0),
    'Estimated Unit Cost (KES)': 0,
    'Total Cost (KES)': budget.totalAmount,
    Justification: `Status: ${budget.status}`,
  });

  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'FY Budget');
  const deptSlug = budget.department.replace(/[^a-zA-Z0-9]+/g, '_');
  const fySlug = budget.financialYear.replace(/[^a-zA-Z0-9]+/g, '_');
  window.XLSX.writeFile(wb, `ERTVC_Budget_${deptSlug}_FY_${fySlug}.xlsx`);
}
