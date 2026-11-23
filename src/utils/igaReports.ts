import {
  DepartmentalIGA,
  IGALogisticsEntry,
  StoreSettings,
} from '../types';
import { addOfficialHeaderToPdf } from './logo';

export function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

export async function generateIGASummaryPdf(options: {
  settings: StoreSettings;
  igaUnits: DepartmentalIGA[];
  igaLogistics: IGALogisticsEntry[];
  departmentFilter?: string;
}): Promise<void> {
  const { igaUnits, igaLogistics, departmentFilter } = options;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const scopedUnits = departmentFilter
    ? igaUnits.filter((u) => u.department.toLowerCase() === departmentFilter.toLowerCase())
    : igaUnits;
  const scopedLogs = departmentFilter
    ? igaLogistics.filter((l) => l.department.toLowerCase() === departmentFilter.toLowerCase())
    : igaLogistics;

  const reportTitle = departmentFilter
    ? `${departmentFilter} — Departmental IGA & Logistics Report`
    : 'Departmental IGA & Logistics Summary Report';
  const bodyStartY = await addOfficialHeaderToPdf(doc, {
    title: reportTitle,
    subtitle: departmentFilter ? `Department Scope: ${departmentFilter}` : 'All TVET Departments',
  });

  const totalRevenue = scopedLogs
    .filter((l) => l.direction === 'Inflow')
    .reduce((sum, l) => sum + (l.totalAmount || 0), 0);
  const totalOutflow = scopedLogs
    .filter((l) => l.direction === 'Outflow')
    .reduce((sum, l) => sum + (l.totalAmount || 0), 0);
  const netSurplus = totalRevenue - totalOutflow;

  doc.autoTable({
    startY: bodyStartY,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    head: [['Registered IGA Units', 'Logistics Entries', 'Total Revenue', 'Total Costs', 'Net Surplus']],
    body: [
      [
        scopedUnits.length,
        scopedLogs.length,
        formatKes(totalRevenue),
        formatKes(totalOutflow),
        formatKes(netSurplus),
      ],
    ],
  });

  const unitsStartY = (doc.autoTable.previous?.finalY || bodyStartY + 20) + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Departmental IGA Units', 14, unitsStartY);

  doc.autoTable({
    startY: unitsStartY + 4,
    theme: 'grid',
    headStyles: { fillColor: [3, 105, 161] },
    head: [['Department', 'IGA Unit Name', 'Approval', 'Status', 'Lead Trainer', 'Revenue', 'Costs', 'Net']],
    body:
      scopedUnits.length > 0
        ? scopedUnits.map((unit) => {
            const unitLogs = scopedLogs.filter((l) => l.igaId === unit.id);
            const rev = unitLogs
              .filter((l) => l.direction === 'Inflow')
              .reduce((s, l) => s + (l.totalAmount || 0), 0);
            const cost = unitLogs
              .filter((l) => l.direction === 'Outflow')
              .reduce((s, l) => s + (l.totalAmount || 0), 0);
            return [
              unit.department,
              unit.igaName,
              unit.approvalStatus || 'Approved',
              unit.status,
              unit.leadTrainer || '-',
              formatKes(rev),
              formatKes(cost),
              formatKes(rev - cost),
            ];
          })
        : [['No departmental IGA units registered', '-', '-', '-', '-', '-', '-', '-']],
  });

  const logsStartY = (doc.autoTable.previous?.finalY || 120) + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('IGA Logistics & Dispatch Ledger', 14, logsStartY);

  doc.autoTable({
    startY: logsStartY + 4,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    head: [['Date', 'Department', 'Type', 'Item / Description', 'Qty', 'Amount (KES)', 'Client / Dest.', 'Status']],
    body:
      scopedLogs.length > 0
        ? scopedLogs.map((l) => [
            l.dateRecorded,
            l.department,
            l.entryType,
            l.description,
            `${l.quantity} ${l.unit}`,
            formatKes(l.totalAmount),
            l.destinationOrClient || '-',
            l.dispatchStatus,
          ])
        : [['No logistics records logged', '-', '-', '-', '-', '-', '-', '-']],
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 15,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' },
    );
  }

  const fileSlug = departmentFilter
    ? `ERTVC_IGA_${departmentFilter.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`
    : 'ERTVC_Departmental_IGA_Logistics_Report.pdf';
  doc.save(fileSlug);
}
