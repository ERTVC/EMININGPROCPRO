/// <reference types="vite/client" />

interface Window {
  // Global libraries loaded via index.html script tags (SheetJS & jsPDF)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jspdf: any;
}
