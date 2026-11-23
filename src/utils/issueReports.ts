import {
  InventoryItem,
  IssueLogEntry,
  IssueSlip,
  Recipient,
  StoreSettings,
  roundStockQuantity,
} from '../types';
import { addOfficialHeaderToPdf } from './logo';

export async function generateIssueSlipPdf(options: {
  settings: StoreSettings;
  recipient: Recipient | null;
  slip: IssueSlip;
  inventory: InventoryItem[];
  issuedByEmail?: string;
}): Promise<void> {
  const { recipient, slip, inventory, issuedByEmail } = options;
  if (!slip || slip.lines.length === 0) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const recipientName = slip.recipientName || slip.recipient || 'Store Recipient';
  const recipientLabel = recipient
    ? `${recipient.name} (${recipient.type}${recipient.regNumber ? ` · ${recipient.regNumber}` : ''})`
    : recipientName;
  const issuedDate = slip.dateIssued
    ? new Date(slip.dateIssued).toLocaleString()
    : new Date().toLocaleString();

  const isGatePass = Boolean(slip.requiresGatePass || slip.scope === 'Outside School');
  const gatePassNo = slip.gatePassNumber || (isGatePass ? 'GP-UNSPECIFIED' : '');
  const usageLocation =
    slip.usageLocation ||
    (isGatePass ? 'External Field / Job Site' : 'Respective Department Workshop');
  const slipShortId = `ISS-${slip.id.slice(0, 6).toUpperCase()}`;

  const bodyStartY = await addOfficialHeaderToPdf(doc, {
    title: isGatePass
      ? 'OFFICIAL STORE GATE PASS (OFF-CAMPUS DISPATCH)'
      : 'CENTRAL STORE WORKSHOP ISSUE VOUCHER',
    subtitle: isGatePass
      ? `Gate Pass No: ${gatePassNo}  |  Slip: ${slipShortId}  |  Issued: ${issuedDate}`
      : `Slip: ${slipShortId}  |  Recipient: ${recipientLabel}  |  Issued: ${issuedDate}`,
  });

  const totalUnits = roundStockQuantity(
    slip.lines.reduce((sum, l) => sum + (Number(l.qtyIssued) || 0), 0),
  );
  const assetCount = slip.lines.filter((l) => Boolean(l.assetId)).length;

  doc.autoTable({
    startY: bodyStartY,
    theme: 'grid',
    headStyles: { fillColor: isGatePass ? [180, 83, 9] : [2, 132, 199] },
    head: isGatePass
      ? [['Gate Pass No.', 'Slip ID', 'Recipient', 'Destination / Job Site', 'Lines / Total Units']]
      : [['Slip ID', 'Recipient', 'Workshop / Practical Location', 'Lines / Assets', 'Total Units']],
    body: isGatePass
      ? [[gatePassNo, slipShortId, recipientLabel, usageLocation, `${slip.lines.length} (${totalUnits} units)`]]
      : [[slipShortId, recipientLabel, usageLocation, `${slip.lines.length} (${assetCount} assets)`, totalUnits]],
  });

  const itemsStartY = (doc.autoTable.previous?.finalY || bodyStartY + 20) + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isGatePass ? 'Authorized Off-Campus Items Schedule' : 'Issued Items Schedule',
    14,
    itemsStartY,
  );

  const inventoryMap = new Map(inventory.map((item) => [item.id, item]));

  doc.autoTable({
    startY: itemsStartY + 4,
    theme: 'grid',
    headStyles: { fillColor: isGatePass ? [146, 64, 14] : [3, 105, 161] },
    head: [['#', 'Item Name', 'Department / Category', 'Type / Serial No.', 'Issued', 'Returned / Damaged', 'Unit', 'Return Status']],
    body: slip.lines.map((line, index) => {
      const inv = inventoryMap.get(line.inventoryId);
      const deptCat = inv
        ? `${inv.department || 'Central Store'}${inv.category ? ` · ${inv.category}` : ''}`
        : '-';
      const serialOrType = line.serialNumber
        ? `Asset (${line.serialNumber})`
        : line.returnable
          ? 'Returnable Stock'
          : 'Consumable';
      const remaining = roundStockQuantity(Math.max(0, line.qtyIssued - line.qtyReturned));
      const retDmgText = !line.returnable
        ? 'N/A'
        : line.qtyDamaged > 0
          ? `${line.qtyReturned} ret (${line.qtyDamaged} dmg)`
          : `${line.qtyReturned} ret`;
      const statusText = !line.returnable
        ? 'Non-Returnable'
        : remaining <= 0
          ? line.returnCondition
            ? `Returned (${line.returnCondition})`
            : 'Returned'
          : line.qtyReturned > 0
            ? `Partial (${remaining} due)`
            : line.returnDate
              ? `Due ${new Date(line.returnDate).toLocaleDateString()}`
              : 'Pending Return';

      return [
        index + 1,
        line.name,
        deptCat,
        serialOrType,
        line.qtyIssued,
        retDmgText,
        line.unit || inv?.unit || 'Pcs',
        statusText,
      ];
    }),
  });

  let signY = (doc.autoTable.previous?.finalY || itemsStartY + 40) + 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const neededHeight = isGatePass ? 52 : 28;
  if (signY + neededHeight > pageHeight - 16) {
    doc.addPage();
    signY = 26;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Issued By (Store / Procurement Officer):', 14, signY);
  doc.text('Received By (Recipient Signature):', pageWidth / 2 + 6, signY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Officer: ${slip.issuedBy || issuedByEmail || 'Central Store Desk'}`,
    14,
    signY + 6,
  );
  doc.text(`Name: ${recipient?.name || recipientName}`, pageWidth / 2 + 6, signY + 6);

  doc.line(14, signY + 17, pageWidth / 2 - 12, signY + 17);
  doc.line(pageWidth / 2 + 6, signY + 17, pageWidth - 14, signY + 17);

  doc.setFontSize(8);
  doc.text('Signature & Stamp / Date', 14, signY + 22);
  doc.text('Signature & Date', pageWidth / 2 + 6, signY + 22);

  if (isGatePass) {
    const gateY = signY + 32;
    doc.setDrawColor(180, 83, 9);
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(14, gateY - 4, pageWidth - 28, 22, 2, 2, 'FD');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SECURITY / SCHOOL GATE CHECK (EXIT CLEARANCE)', 18, gateY + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(
      'Guard / Security Officer: _________________________   Exit Time: ___________   Signature: ______________________',
      18,
      gateY + 12,
    );
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 15,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' },
    );
  }

  const safeRecipient = (recipient?.name || recipientName || 'Recipient')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10);
  if (isGatePass && gatePassNo) {
    const safeGp = gatePassNo.replace(/[^a-zA-Z0-9-]+/g, '_');
    doc.save(`ERTVC_Gate_Pass_${safeGp}_${safeRecipient}.pdf`);
  } else {
    doc.save(`ERTVC_Issue_Slip_${safeRecipient}_${dateStamp}.pdf`);
  }
}

export async function generateBulkIssueVoucherPdf(options: {
  settings: StoreSettings;
  recipient: Recipient | null;
  logs: IssueLogEntry[];
  inventory: InventoryItem[];
  issuedByEmail?: string;
}): Promise<void> {
  const { recipient, logs, inventory, issuedByEmail } = options;
  if (logs.length === 0) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const recipientLabel = recipient
    ? `${recipient.name} (${recipient.type}${recipient.regNumber ? ` · ${recipient.regNumber}` : ''})`
    : logs[0].recipientName || 'Store Recipient';
  const issuedDate = logs[0].dateIssued
    ? new Date(logs[0].dateIssued).toLocaleString()
    : new Date().toLocaleString();

  const isGatePass = Boolean(
    logs.some((l) => l.requiresGatePass || l.usageScope === 'Outside School'),
  );
  const gatePassNo =
    logs.find((l) => Boolean(l.gatePassNumber))?.gatePassNumber ||
    (isGatePass ? 'GP-UNSPECIFIED' : '');
  const usageLocation =
    logs.find((l) => Boolean(l.usageLocation))?.usageLocation ||
    (isGatePass ? 'External Field / Job Site' : 'Respective Department Workshop');

  const bodyStartY = await addOfficialHeaderToPdf(doc, {
    title: isGatePass
      ? 'OFFICIAL STORE GATE PASS (OFF-CAMPUS DISPATCH)'
      : 'CENTRAL STORE WORKSHOP ISSUE VOUCHER',
    subtitle: isGatePass
      ? `Gate Pass No: ${gatePassNo}  |  Issued: ${issuedDate}`
      : `Recipient: ${recipientLabel}  |  Issued: ${issuedDate}`,
  });

  const totalUnits = Math.round(
    logs.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) * 100,
  ) / 100;
  const assetCount = logs.filter((l) => Boolean(l.assetId)).length;

  doc.autoTable({
    startY: bodyStartY,
    theme: 'grid',
    headStyles: { fillColor: isGatePass ? [180, 83, 9] : [2, 132, 199] },
    head: isGatePass
      ? [['Gate Pass No.', 'Recipient', 'Destination / Job Site', 'Usage Scope', 'Lines / Total Units']]
      : [['Recipient', 'Workshop / Practical Location', 'Distinct Lines', 'Total Units', 'Serialized Assets']],
    body: isGatePass
      ? [[gatePassNo, recipientLabel, usageLocation, 'Outside School', `${logs.length} (${totalUnits} units)`]]
      : [[recipientLabel, usageLocation, logs.length, totalUnits, assetCount]],
  });

  const itemsStartY = (doc.autoTable.previous?.finalY || bodyStartY + 20) + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isGatePass ? 'Authorized Off-Campus Items Schedule' : 'Issued Items Schedule',
    14,
    itemsStartY,
  );

  const inventoryMap = new Map(inventory.map((item) => [item.id, item]));

  doc.autoTable({
    startY: itemsStartY + 4,
    theme: 'grid',
    headStyles: { fillColor: isGatePass ? [146, 64, 14] : [3, 105, 161] },
    head: [['#', 'Item Name', 'Department / Category', 'Type / Serial No.', 'Qty', 'Unit', 'Return Due']],
    body: logs.map((log, index) => {
      const inv = inventoryMap.get(log.inventoryId);
      const deptCat = inv
        ? `${inv.department || 'Central Store'}${inv.category ? ` · ${inv.category}` : ''}`
        : '-';
      const serialOrType = log.serialNumber
        ? `Asset (${log.serialNumber})`
        : !log.returned
          ? 'Returnable Stock'
          : 'Consumable';
      const returnDue = !log.returned
        ? log.returnDate
          ? new Date(log.returnDate).toLocaleDateString()
          : 'Required'
        : 'Non-Returnable';

      return [
        index + 1,
        log.itemName,
        deptCat,
        serialOrType,
        log.quantity,
        log.unit || inv?.unit || 'Pcs',
        returnDue,
      ];
    }),
  });

  let signY = (doc.autoTable.previous?.finalY || itemsStartY + 40) + 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const neededHeight = isGatePass ? 52 : 28;
  if (signY + neededHeight > pageHeight - 16) {
    doc.addPage();
    signY = 26;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Issued By (Store / Procurement Officer):', 14, signY);
  doc.text('Received By (Recipient Signature):', pageWidth / 2 + 6, signY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Officer: ${issuedByEmail || 'Central Store Desk'}`,
    14,
    signY + 6,
  );
  doc.text(`Name: ${recipient?.name || logs[0].recipientName}`, pageWidth / 2 + 6, signY + 6);

  doc.line(14, signY + 17, pageWidth / 2 - 12, signY + 17);
  doc.line(pageWidth / 2 + 6, signY + 17, pageWidth - 14, signY + 17);

  doc.setFontSize(8);
  doc.text('Signature & Stamp / Date', 14, signY + 22);
  doc.text('Signature & Date', pageWidth / 2 + 6, signY + 22);

  if (isGatePass) {
    const gateY = signY + 32;
    doc.setDrawColor(180, 83, 9);
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(14, gateY - 4, pageWidth - 28, 22, 2, 2, 'FD');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SECURITY / SCHOOL GATE CHECK (EXIT CLEARANCE)', 18, gateY + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(
      'Guard / Security Officer: _________________________   Exit Time: ___________   Signature: ______________________',
      18,
      gateY + 12,
    );
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 15,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' },
    );
  }

  const safeRecipient = (recipient?.name || logs[0].recipientName || 'Recipient')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10);
  if (isGatePass && gatePassNo) {
    const safeGp = gatePassNo.replace(/[^a-zA-Z0-9-]+/g, '_');
    doc.save(`ERTVC_Gate_Pass_${safeGp}_${safeRecipient}.pdf`);
  } else {
    doc.save(`ERTVC_Workshop_Voucher_${safeRecipient}_${dateStamp}.pdf`);
  }
}
