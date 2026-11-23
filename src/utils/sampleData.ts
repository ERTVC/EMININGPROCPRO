export const DEMO_ID_MARKER = 'sample-';

export function isDemoDocumentId(id: string): boolean {
  const normalized = String(id || '').trim();
  return normalized.startsWith('sample-') || normalized.includes('-sample-');
}

export const SAMPLE_INVENTORY = [
  // 1. Electrical
  { id: 'sample-inv-elec-meter', name: 'Digital Clamp Meter', category: 'Workshop Tools', unit: 'Pcs', department: 'Electrical', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-sockets', name: '13A Twin Switched Sockets', category: 'Electrical Fittings', unit: 'Pcs', department: 'Electrical', type: 'Consumable' as const, quantity: 30, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-lamp-holders', name: 'Batten Lamp Holders', category: 'Electrical Fittings', unit: 'Pcs', department: 'Electrical', type: 'Consumable' as const, quantity: 40, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-switches', name: '1-Gang 1-Way Switches', category: 'Electrical Fittings', unit: 'Pcs', department: 'Electrical', type: 'Consumable' as const, quantity: 25, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-cable-red', name: 'Live Cable Red (1.5mm²)', category: 'Electrical Cables', unit: 'Meters', department: 'Electrical', type: 'Consumable' as const, quantity: 270, condition: 'N/A', isIGA: false, isConsumable: true, purchaseUnit: 'Rolls', unitsPerPurchase: 90 },
  { id: 'sample-inv-cable-black', name: 'Neutral Cable Black (1.5mm²)', category: 'Electrical Cables', unit: 'Meters', department: 'Electrical', type: 'Consumable' as const, quantity: 180, condition: 'N/A', isIGA: false, isConsumable: true, purchaseUnit: 'Rolls', unitsPerPurchase: 90 },

  // 2. AGME
  { id: 'sample-inv-4', name: 'Welding Machine', category: 'Workshop Tools', unit: 'Pcs', department: 'AGME', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: true, isConsumable: false },
  { id: 'sample-inv-agme-vice', name: 'Bench Vice & Spanner Set', category: 'Workshop Tools', unit: 'Sets', department: 'AGME', type: 'Consumable' as const, quantity: 14, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-agme-rods', name: 'Mild Steel Welding Rods (6013)', category: 'Welding Supplies', unit: 'Kgs', department: 'AGME', type: 'Consumable' as const, quantity: 45, condition: 'N/A', isIGA: true, isConsumable: true },
  { id: 'sample-inv-agme-discs', name: 'Angle Grinder Cutting Discs (4.5")', category: 'Welding Supplies', unit: 'Pcs', department: 'AGME', type: 'Consumable' as const, quantity: 60, condition: 'N/A', isIGA: false, isConsumable: true },

  // 3. Food & Beverage
  { id: 'sample-inv-fb-mixer', name: 'Commercial Stand Mixer', category: 'Kitchen Equipment', unit: 'Pcs', department: 'Food & Beverage', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-fb-chafing', name: 'Stainless Chafing Dish Sets', category: 'Catering Utensils', unit: 'Sets', department: 'Food & Beverage', type: 'Consumable' as const, quantity: 16, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-fb-flour', name: 'All-Purpose Baking Flour', category: 'Food Supplies', unit: 'Kgs', department: 'Food & Beverage', type: 'Consumable' as const, quantity: 100, condition: 'N/A', isIGA: false, isConsumable: true },

  // 4. Fashion
  { id: 'sample-inv-fash-sew', name: 'Industrial Straight-Stitch Sewing Machine', category: 'Tailoring Machinery', unit: 'Pcs', department: 'Fashion', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: true, isConsumable: false },
  { id: 'sample-inv-15', name: 'Fabric Rolls — Blue Twill (IGA)', category: 'IGA', unit: 'Meters', department: 'Fashion', type: 'Consumable' as const, quantity: 150, condition: 'N/A', isIGA: true, isConsumable: true, purchaseUnit: 'Rolls', unitsPerPurchase: 50 },
  { id: 'sample-inv-fash-shears', name: 'Tailor Cutting Shears (10-Inch)', category: 'Workshop Tools', unit: 'Pcs', department: 'Fashion', type: 'Consumable' as const, quantity: 20, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-fash-thread', name: 'Overlock Thread Cones & Zippers', category: 'Tailoring Supplies', unit: 'Pcs', department: 'Fashion', type: 'Consumable' as const, quantity: 120, condition: 'N/A', isIGA: true, isConsumable: true },

  // 5. Cosmetology
  { id: 'sample-inv-cosm-dryer', name: 'Salon Stand Hair Dryer', category: 'Salon Equipment', unit: 'Pcs', department: 'Cosmetology', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-cosm-mannequin', name: 'Training Mannequin Heads', category: 'Salon Tools', unit: 'Pcs', department: 'Cosmetology', type: 'Consumable' as const, quantity: 18, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-cosm-shampoo', name: 'Shampoo & Conditioning Treatment', category: 'Cosmetic Supplies', unit: 'Litres', department: 'Cosmetology', type: 'Consumable' as const, quantity: 25, condition: 'N/A', isIGA: false, isConsumable: true },

  // 6. Building
  { id: 'sample-inv-bld-vibrator', name: 'Concrete Poker Vibrator', category: 'Construction Plant', unit: 'Pcs', department: 'Building', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-bld-trowels', name: 'Bricklaying Trowels & Spirit Levels', category: 'Masonry Tools', unit: 'Pcs', department: 'Building', type: 'Consumable' as const, quantity: 35, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-bld-cement', name: 'Portland Cement (50kg Bags)', category: 'Construction Materials', unit: 'Bags', department: 'Building', type: 'Consumable' as const, quantity: 40, condition: 'N/A', isIGA: false, isConsumable: true },

  // 7. Business
  { id: 'sample-inv-bus-calc', name: 'Scientific Financial Calculators', category: 'Office Equipment', unit: 'Pcs', department: 'Business', type: 'Consumable' as const, quantity: 30, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-bus-ledger', name: 'Accounting Ledger & Cash Books', category: 'Stationery', unit: 'Pcs', department: 'Business', type: 'Consumable' as const, quantity: 45, condition: 'N/A', isIGA: false, isConsumable: true },

  // 8. Informatics & ICT
  { id: 'sample-inv-1', name: 'Dell Latitude 5400 Laptop', category: 'Electronics', unit: 'Pcs', department: 'Informatics & ICT', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-2', name: 'Epson L3210 Projector', category: 'Electronics', unit: 'Pcs', department: 'Informatics & ICT', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-8', name: 'HP Compaq Desktop', category: 'Electronics', unit: 'Pcs', department: 'Informatics & ICT', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },
  { id: 'sample-inv-17', name: 'HDMI Cables', category: 'Electronics', unit: 'Pcs', department: 'Informatics & ICT', type: 'Consumable' as const, quantity: 12, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-ict-cat6', name: 'Cat6 Ethernet Cable', category: 'Networking', unit: 'Meters', department: 'Informatics & ICT', type: 'Consumable' as const, quantity: 305, condition: 'N/A', isIGA: false, isConsumable: true, purchaseUnit: 'Boxes', unitsPerPurchase: 305 },

  // 9. Sports
  { id: 'sample-inv-spt-balls', name: 'Leather Footballs (Size 5)', category: 'Sports Gear', unit: 'Pcs', department: 'Sports', type: 'Consumable' as const, quantity: 18, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-spt-nets', name: 'Volleyball Nets & Training Cones', category: 'Sports Gear', unit: 'Sets', department: 'Sports', type: 'Consumable' as const, quantity: 10, condition: 'Good', isIGA: false, isConsumable: false },

  // 10. Deans
  { id: 'sample-inv-7', name: 'Whiteboard Markers (Box)', category: 'Stationery', unit: 'Box', department: 'Deans', type: 'Consumable' as const, quantity: 30, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-dean-boards', name: 'Timetable Display Whiteboards', category: 'Academic Supplies', unit: 'Pcs', department: 'Deans', type: 'Consumable' as const, quantity: 8, condition: 'Good', isIGA: false, isConsumable: false },

  // 11. DP Administration Office
  { id: 'sample-inv-3', name: 'A4 Ream Paper', category: 'Stationery', unit: 'Ream', department: 'DP Administration Office', type: 'Consumable' as const, quantity: 50, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-adm-staplers', name: 'Heavy-Duty Staplers & Hole Punches', category: 'Office Tools', unit: 'Pcs', department: 'DP Administration Office', type: 'Consumable' as const, quantity: 15, condition: 'Good', isIGA: false, isConsumable: false },

  // 12. Examination
  { id: 'sample-inv-exam-paper', name: 'KNEC Exam Foolscap Reams', category: 'Exam Stationery', unit: 'Ream', department: 'Examination', type: 'Consumable' as const, quantity: 60, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-exam-boxes', name: 'Lockable Steel Exam Script Boxes', category: 'Security Storage', unit: 'Pcs', department: 'Examination', type: 'Consumable' as const, quantity: 12, condition: 'Good', isIGA: false, isConsumable: false },

  // 13. Registry
  { id: 'sample-inv-reg-files', name: 'Trainee Admission Box Files', category: 'Office Filing', unit: 'Pcs', department: 'Registry', type: 'Consumable' as const, quantity: 80, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-reg-stamps', name: 'Institutional Date & Registry Stamps', category: 'Registry Equipment', unit: 'Pcs', department: 'Registry', type: 'Consumable' as const, quantity: 6, condition: 'Good', isIGA: false, isConsumable: false },

  // 14. Agricultural Extension
  { id: 'sample-inv-agri-sprayer', name: 'Knapsack Sprayers (16L)', category: 'Farm Equipment', unit: 'Pcs', department: 'Agricultural Extension', type: 'Consumable' as const, quantity: 10, condition: 'Good', isIGA: true, isConsumable: false },
  { id: 'sample-inv-agri-seeds', name: 'Certified Hybrid Maize Seed (2kg)', category: 'Farm Inputs', unit: 'Pkts', department: 'Agricultural Extension', type: 'Consumable' as const, quantity: 35, condition: 'N/A', isIGA: true, isConsumable: true },

  // 15. Innovation
  { id: 'sample-inv-inn-arduino', name: 'Arduino & Sensor Prototyping Kits', category: 'Electronics', unit: 'Kits', department: 'Innovation', type: 'Consumable' as const, quantity: 16, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-inn-filament', name: 'PLA 3D Printer Filament Spools', category: 'Innovation Materials', unit: 'Spools', department: 'Innovation', type: 'Consumable' as const, quantity: 12, condition: 'N/A', isIGA: false, isConsumable: true },

  // 16. IGA
  { id: 'sample-inv-iga-scale', name: 'Digital Platform Weighing Scale (150kg)', category: 'IGA Equipment', unit: 'Pcs', department: 'IGA', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: true, isConsumable: false },
  { id: 'sample-inv-iga-receipts', name: 'Printed IGA Receipt & Delivery Books', category: 'IGA Stationery', unit: 'Books', department: 'IGA', type: 'Consumable' as const, quantity: 24, condition: 'N/A', isIGA: true, isConsumable: true },

  // 17. Kitchen & Catering
  { id: 'sample-inv-6', name: 'Cooking Oil', category: 'Kitchen Supplies', unit: 'Litres', department: 'Kitchen & Catering', type: 'Consumable' as const, quantity: 20, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-10', name: 'Maize Flour', category: 'Kitchen Supplies', unit: 'Kgs', department: 'Kitchen & Catering', type: 'Consumable' as const, quantity: 150, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-kit-sufurias', name: 'Heavy-Duty Aluminum Sufurias (50L)', category: 'Kitchen Utensils', unit: 'Pcs', department: 'Kitchen & Catering', type: 'Consumable' as const, quantity: 10, condition: 'Good', isIGA: false, isConsumable: false },

  // 18. Cleaning
  { id: 'sample-inv-cln-detergent', name: 'Multi-Purpose Liquid Detergent (20L)', category: 'Cleaning Supplies', unit: 'Jerricans', department: 'Cleaning', type: 'Consumable' as const, quantity: 14, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-cln-mops', name: 'Industrial Floor Mops & Squeegees', category: 'Cleaning Tools', unit: 'Pcs', department: 'Cleaning', type: 'Consumable' as const, quantity: 25, condition: 'Good', isIGA: false, isConsumable: false },

  // 19. Principal's Office
  { id: 'sample-inv-prin-paper', name: 'Executive A4 Printing Paper (80gsm)', category: 'Stationery', unit: 'Ream', department: "Principal's Office", type: 'Consumable' as const, quantity: 25, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-prin-toner', name: 'Executive LaserJet Printer Toner', category: 'Office Supplies', unit: 'Pcs', department: "Principal's Office", type: 'Consumable' as const, quantity: 6, condition: 'N/A', isIGA: false, isConsumable: true },

  // 20. DP Academics Office
  { id: 'sample-inv-acad-folders', name: 'Curriculum & Syllabus Ring Binders', category: 'Academic Supplies', unit: 'Pcs', department: 'DP Academics Office', type: 'Consumable' as const, quantity: 40, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-acad-scanner', name: 'Departmental Document Scanner', category: 'Electronics', unit: 'Pcs', department: 'DP Academics Office', type: 'Asset' as const, quantity: 0, condition: 'N/A', isIGA: false, isConsumable: false },

  // 21. Accounts Office
  { id: 'sample-inv-acc-vouchers', name: 'Payment Voucher & Receipt Books', category: 'Finance Stationery', unit: 'Books', department: 'Accounts Office', type: 'Consumable' as const, quantity: 35, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-acc-calc', name: 'Desktop Printing Calculators', category: 'Office Equipment', unit: 'Pcs', department: 'Accounts Office', type: 'Consumable' as const, quantity: 8, condition: 'Good', isIGA: false, isConsumable: false },

  // 22. Main Store
  { id: 'sample-inv-ms-padlocks', name: 'Heavy-Duty Brass Padlocks & Seals', category: 'Store Security', unit: 'Pcs', department: 'Main Store', type: 'Consumable' as const, quantity: 20, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-ms-bin', name: 'Stock Bin Cards & Inventory Ledgers', category: 'Store Stationery', unit: 'Packs', department: 'Main Store', type: 'Consumable' as const, quantity: 25, condition: 'N/A', isIGA: false, isConsumable: true },

  // 23. Kitchen
  { id: 'sample-inv-ktn-gas', name: 'Commercial LPG Cylinders (50kg)', category: 'Kitchen Fuel', unit: 'Cylinders', department: 'Kitchen', type: 'Consumable' as const, quantity: 6, condition: 'Good', isIGA: false, isConsumable: false },
  { id: 'sample-inv-ktn-rice', name: 'Basmati Rice (50kg Bags)', category: 'Kitchen Supplies', unit: 'Bags', department: 'Kitchen', type: 'Consumable' as const, quantity: 18, condition: 'N/A', isIGA: false, isConsumable: true },

  // 24. Sanitation
  { id: 'sample-inv-san-disinfectant', name: 'Heavy-Duty Pine Disinfectant (20L)', category: 'Sanitation Supplies', unit: 'Jerricans', department: 'Sanitation', type: 'Consumable' as const, quantity: 12, condition: 'N/A', isIGA: false, isConsumable: true },
  { id: 'sample-inv-san-gloves', name: 'Protective Rubber Gloves & Boots', category: 'PPE Gear', unit: 'Pairs', department: 'Sanitation', type: 'Consumable' as const, quantity: 24, condition: 'Good', isIGA: false, isConsumable: false },
];

export const SAMPLE_ASSETS = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `sample-asset-dell-${i + 1}`,
    inventoryId: 'sample-inv-1',
    serialNumber: `DELL-L5400-${1001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `sample-asset-eps-${i + 1}`,
    inventoryId: 'sample-inv-2',
    serialNumber: `EPS-L3210-${2001 + i}`,
    condition: 'Serviceable' as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `sample-asset-elec-${i + 1}`,
    inventoryId: 'sample-inv-elec-meter',
    serialNumber: `CLMP-EL-${3001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `sample-asset-wld-${i + 1}`,
    inventoryId: 'sample-inv-4',
    serialNumber: `WLD-MCH-${4001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `sample-asset-fb-${i + 1}`,
    inventoryId: 'sample-inv-fb-mixer',
    serialNumber: `MIX-FB-${5001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `sample-asset-fash-${i + 1}`,
    inventoryId: 'sample-inv-fash-sew',
    serialNumber: `SEW-FS-${6001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `sample-asset-cosm-${i + 1}`,
    inventoryId: 'sample-inv-cosm-dryer',
    serialNumber: `DRY-CS-${7001 + i}`,
    condition: 'Good' as const,
  })),
  {
    id: 'sample-asset-hp-1',
    inventoryId: 'sample-inv-8',
    serialNumber: 'HP-DCOMP-8001',
    condition: 'Obsolete' as const,
  },
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `sample-asset-bld-${i + 1}`,
    inventoryId: 'sample-inv-bld-vibrator',
    serialNumber: `CON-BL-${8101 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `sample-asset-iga-${i + 1}`,
    inventoryId: 'sample-inv-iga-scale',
    serialNumber: `SCL-IGA-${9001 + i}`,
    condition: 'Good' as const,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `sample-asset-acad-${i + 1}`,
    inventoryId: 'sample-inv-acad-scanner',
    serialNumber: `SCN-AC-${9101 + i}`,
    condition: 'Good' as const,
  })),
];

export const SAMPLE_RECIPIENTS = [
  { id: 'sample-rec-1', name: 'Main Store', type: 'Department' as const, regNumber: '' },
  { id: 'sample-rec-2', name: 'Kitchen & Catering', type: 'Department' as const, regNumber: '' },
  { id: 'sample-rec-3', name: 'Mr. John Doe', type: 'Trainer' as const, regNumber: 'S/056/2010' },
  { id: 'sample-rec-4', name: 'Jane Smith', type: 'Trainee' as const, regNumber: 'T/123/2024' },
  { id: 'sample-rec-5', name: 'Informatics & ICT Department', type: 'Department' as const, regNumber: '' },
  { id: 'sample-rec-6', name: 'Mrs. Alice Williams', type: 'Trainer' as const, regNumber: 'S/089/2015' },
  { id: 'sample-rec-7', name: 'Eng. Peter Kiprop', type: 'Trainer' as const, regNumber: 'S/112/2018' },
  { id: 'sample-rec-8', name: 'Brian Kiptoo', type: 'Trainee' as const, regNumber: 'T/204/2025' },
];

export const STANDARD_TVET_DEPARTMENTS = [
  "Principal's Office",
  'DP Administration Office',
  'DP Academics Office',
  'Accounts Office',
  'Registry',
  'Examination',
  'Deans',
  'Main Store',
  'Electrical',
  'AGME',
  'Food & Beverage',
  'Fashion',
  'Cosmetology',
  'Building',
  'Business',
  'Informatics & ICT',
  'Sports',
  'Agricultural Extension',
  'Innovation',
  'IGA',
  'Kitchen & Catering',
  'Kitchen',
  'Cleaning',
  'Sanitation',
];

export function defaultActivityTypeForDepartment(
  department: string,
): 'Manufacturing' | 'Services' | 'Agriculture' | 'Catering' | 'Retail' | 'Other' {
  const key = department.trim().toLowerCase();
  if (key.includes('food') || key.includes('beverage') || key.includes('kitchen') || key.includes('catering')) {
    return 'Catering';
  }
  if (key.includes('agricult')) {
    return 'Agriculture';
  }
  if (
    key.includes('electrical') ||
    key.includes('agme') ||
    key.includes('fashion') ||
    key.includes('building') ||
    key.includes('innovation')
  ) {
    return 'Manufacturing';
  }
  if (key === 'iga') {
    return 'Retail';
  }
  return 'Services';
}

export const SAMPLE_IGA_UNITS = [
  {
    id: 'sample-iga-agme',
    department: 'AGME',
    igaName: 'AGME Metal Fabrication & Mechanical Unit',
    activityType: 'Manufacturing' as const,
    leadTrainer: 'AGME Workshop Lead',
    status: 'Active' as const,
    description: 'Fabrication of institutional desks, steel windows, doors, machinery repairs, and welding works.',
    approvalStatus: 'Approved' as const,
    approvalNotes: 'Approved starter college workshop enterprise.',
    reviewedByEmail: 'procurementertvc@gmail.com',
    proposalFileName: '',
    proposalDataUrl: '',
    proposalLink: '',
    proposalSummary: 'Fabrication and mechanical maintenance IGA utilizing AGME workshop equipment.',
  },
  {
    id: 'sample-iga-fashion',
    department: 'Fashion',
    igaName: 'Fashion Garment Production & Uniform Unit',
    activityType: 'Manufacturing' as const,
    leadTrainer: 'Fashion & Design Coordinator',
    status: 'Active' as const,
    description: 'Production of trainee lab coats, dust coats, aprons, and institutional uniforms.',
    approvalStatus: 'Approved' as const,
    approvalNotes: 'Approved starter college garment enterprise.',
    reviewedByEmail: 'procurementertvc@gmail.com',
    proposalFileName: '',
    proposalDataUrl: '',
    proposalLink: '',
    proposalSummary: 'In-house tailoring of trainee dust coats, lab coats, and uniforms.',
  },
  {
    id: 'sample-iga-catering',
    department: 'Kitchen & Catering',
    igaName: 'Hospitality Catering & Bakery Unit',
    activityType: 'Catering' as const,
    leadTrainer: 'Hospitality & Catering Head',
    status: 'Active' as const,
    description: 'Campus events catering, pastries, and institutional luncheon services.',
    approvalStatus: 'Approved' as const,
    approvalNotes: 'Approved starter hospitality and bakery enterprise.',
    reviewedByEmail: 'procurementertvc@gmail.com',
    proposalFileName: '',
    proposalDataUrl: '',
    proposalLink: '',
    proposalSummary: 'Institutional event catering, bakery goods, and hospitality production.',
  },
  {
    id: 'sample-iga-ict',
    department: 'Informatics & ICT',
    igaName: 'Informatics ICT Maintenance & Digital Studio',
    activityType: 'Services' as const,
    leadTrainer: 'Informatics & ICT Lead',
    status: 'Active' as const,
    description: 'Computer repair, binding, bulk printing, networking, and digital services.',
    approvalStatus: 'Approved' as const,
    approvalNotes: 'Approved starter digital services enterprise.',
    reviewedByEmail: 'procurementertvc@gmail.com',
    proposalFileName: '',
    proposalDataUrl: '',
    proposalLink: '',
    proposalSummary: 'Computer servicing, document binding, printing, and campus networking studio.',
  },
  {
    id: 'sample-iga-electrical',
    department: 'Electrical',
    igaName: 'Electrical Solar & Domestic Wiring Unit',
    activityType: 'Services' as const,
    leadTrainer: 'Eng. Peter Kiprop',
    status: 'Planned' as const,
    description: 'Commercial domestic installation, solar PV setup, and appliance servicing by supervised Electrical trainees.',
    approvalStatus: 'Pending' as const,
    approvalNotes: '',
    reviewedByEmail: '',
    proposalFileName: '',
    proposalDataUrl: '',
    proposalLink: 'https://drive.google.com/file/d/1ERTVC-Sample-Electrical-Solar-IGA-Proposal/view',
    proposalSummary: 'Google Drive proposal covering projected solar kit revenue, wiring labor rates, and safety compliance.',
  },
];

export const SAMPLE_IGA_LOGISTICS = [
  {
    id: 'sample-iga-log-1',
    igaId: 'sample-iga-fashion',
    department: 'Fashion',
    igaName: 'Fashion Garment Production & Uniform Unit',
    entryType: 'Production Output' as const,
    inventoryId: '',
    description: '25 Trainee Dust Coats (Blue Twill)',
    quantity: 25,
    unit: 'Pcs',
    unitAmount: 850,
    totalAmount: 21250,
    direction: 'Internal' as const,
    dispatchStatus: 'Completed' as const,
    destinationOrClient: 'Central Store / Workshop',
    notes: 'Ready for issue to Engineering trainees.',
  },
  {
    id: 'sample-iga-log-2',
    igaId: 'sample-iga-agme',
    department: 'AGME',
    igaName: 'AGME Metal Fabrication & Mechanical Unit',
    entryType: 'Sales Revenue' as const,
    inventoryId: '',
    description: '10 Steel Lecture Hall Chairs',
    quantity: 10,
    unit: 'Pcs',
    unitAmount: 3200,
    totalAmount: 32000,
    direction: 'Inflow' as const,
    dispatchStatus: 'Delivered' as const,
    destinationOrClient: 'Eldama Ravine Local Academy',
    notes: 'Delivered by college van; receipt verified.',
  },
  {
    id: 'sample-iga-log-3',
    igaId: 'sample-iga-catering',
    department: 'Kitchen & Catering',
    igaName: 'Hospitality Catering & Bakery Unit',
    entryType: 'Direct Purchase' as const,
    inventoryId: '',
    description: 'Baking Sugar, Yeast & Packaging Boxes',
    quantity: 1,
    unit: 'Lot',
    unitAmount: 6400,
    totalAmount: 6400,
    direction: 'Outflow' as const,
    dispatchStatus: 'Completed' as const,
    destinationOrClient: 'Ravine Wholesalers',
    notes: 'Local direct procurement for board meeting catering.',
  },
];

export const SAMPLE_ISSUE_LOGS = [
  {
    id: 'sample-issue-1',
    inventoryId: 'sample-inv-sockets',
    assetId: '',
    recipientId: 'sample-rec-7',
    quantity: 10,
    itemName: '13A Twin Switched Sockets',
    serialNumber: '',
    recipientName: 'Eng. Peter Kiprop',
    unit: 'Pcs',
    isConsumable: false,
    usageScope: 'Workshop / Practical' as const,
    usageLocation: 'Electrical Workshop B',
    requiresGatePass: false,
    gatePassNumber: '',
    returned: false,
    daysUntilReturn: 7,
    simulateReturn: false,
  },
  {
    id: 'sample-issue-2',
    inventoryId: 'sample-inv-lamp-holders',
    assetId: '',
    recipientId: 'sample-rec-3',
    quantity: 12,
    itemName: 'Batten Lamp Holders',
    serialNumber: '',
    recipientName: 'Mr. John Doe',
    unit: 'Pcs',
    isConsumable: false,
    usageScope: 'Outside School' as const,
    usageLocation: 'Eldama Ravine Sub-County Hospital Annex',
    requiresGatePass: true,
    gatePassNumber: 'GP-DEMO-1001',
    returned: false,
    daysUntilReturn: 14,
    simulateReturn: false,
  },
  {
    id: 'sample-issue-3',
    inventoryId: 'sample-inv-1',
    assetId: 'sample-asset-dell-1',
    recipientId: 'sample-rec-6',
    quantity: 1,
    itemName: 'Dell Latitude 5400 Laptop',
    serialNumber: 'DELL-L5400-1001',
    recipientName: 'Mrs. Alice Williams',
    unit: 'Pcs',
    isConsumable: false,
    usageScope: 'Workshop / Practical' as const,
    usageLocation: 'ICT Lab 1',
    requiresGatePass: false,
    gatePassNumber: '',
    returned: false,
    daysUntilReturn: 14,
    simulateReturn: false,
  },
  {
    id: 'sample-issue-4',
    inventoryId: 'sample-inv-cable-red',
    assetId: '',
    recipientId: 'sample-rec-8',
    quantity: 18,
    itemName: 'Live Cable Red (1.5mm²)',
    serialNumber: '',
    recipientName: 'Brian Kiptoo',
    unit: 'Meters',
    isConsumable: true,
    usageScope: 'Workshop / Practical' as const,
    usageLocation: 'Electrical Workshop A',
    requiresGatePass: false,
    gatePassNumber: '',
    returned: true,
    daysUntilReturn: 0,
    simulateReturn: false,
  },
  {
    id: 'sample-issue-5',
    inventoryId: 'sample-inv-switches',
    assetId: '',
    recipientId: 'sample-rec-7',
    quantity: 10,
    itemName: '1-Gang 1-Way Switches',
    serialNumber: '',
    recipientName: 'Eng. Peter Kiprop',
    unit: 'Pcs',
    isConsumable: false,
    usageScope: 'Workshop / Practical' as const,
    usageLocation: 'Electrical Workshop A',
    requiresGatePass: false,
    gatePassNumber: '',
    returned: false,
    daysUntilReturn: 3,
    simulateReturn: true,
    returnCondition: 'Serviceable' as const,
    restoredQuantity: 8,
    damagedQuantity: 2,
    returnConditionNotes: '8 switches returned in good order; 2 rockers cracked during practical wiring.',
  },
];

export const SAMPLE_ISSUE_REQUESTS = [
  {
    id: 'sample-req-1',
    department: 'Electrical',
    requestedByName: 'Electrical HOD (Demo)',
    inventoryId: 'sample-inv-cable-black',
    itemName: 'Neutral Cable Black (1.5mm²)',
    quantity: 30,
    unit: 'Meters',
    recipientName: 'Eng. Peter Kiprop',
    usageScope: 'Workshop / Practical' as const,
    usageLocation: 'Electrical Workshop A',
    requiresGatePass: false,
    urgency: 'Normal' as const,
    message: 'Requested for Level 5 Electrical Installation practical assessment.',
  },
  {
    id: 'sample-req-2',
    department: 'Informatics & ICT',
    requestedByName: 'ICT HOD (Demo)',
    inventoryId: 'sample-inv-2',
    itemName: 'Epson L3210 Projector',
    quantity: 1,
    unit: 'Pcs',
    recipientName: 'Informatics & ICT Department',
    usageScope: 'Outside School' as const,
    usageLocation: 'Baringo County TVET Expo Grounds',
    requiresGatePass: true,
    urgency: 'Urgent' as const,
    message: 'External college exhibition presentation — Gate Pass required for security checkpoint.',
  },
];

export const SAMPLE_DISPOSAL_REQUESTS = [
  {
    id: 'sample-disp-1',
    assetId: 'sample-asset-hp-1',
    inventoryId: 'sample-inv-8',
    method: 'Public Auction' as const,
    itemName: 'HP Compaq Desktop (HP-DCOMP-8001)',
    itemCategory: 'Electronics',
  },
];

export const SAMPLE_DEPARTMENT_BUDGETS = [
  {
    id: 'sample-budget-elec-2627',
    department: 'Electrical',
    financialYear: '2026/2027',
    title: 'Electrical Engineering Annual Training & Workshop Budget',
    status: 'Submitted' as const,
    submittedByName: 'Electrical HOD (Demo)',
    reviewedByEmail: '',
    reviewNotes: '',
    notes: 'Prioritizes copper cable rolls, returnable practical accessories, and testing meters for Term 1–3.',
    lineItems: [
      {
        id: 'line-elec-1',
        category: 'Consumables & Training Materials' as const,
        itemName: 'Live & Neutral PVC Cables (1.5mm², 90m Rolls)',
        unit: 'Rolls',
        quantity: 12,
        estimatedUnitCost: 4200,
        totalCost: 50400,
        justification: 'Practical wiring exercises for Craft & Diploma cohorts.',
      },
      {
        id: 'line-elec-2',
        category: 'Tools & Workshop Equipment' as const,
        itemName: '13A Twin Switched Sockets & Switches Kit',
        unit: 'Lots',
        quantity: 5,
        estimatedUnitCost: 8500,
        totalCost: 42500,
        justification: 'Replacement of worn workshop practical boards.',
      },
      {
        id: 'line-elec-3',
        category: 'Tools & Workshop Equipment' as const,
        itemName: 'Digital Clamp Meters',
        unit: 'Pcs',
        quantity: 6,
        estimatedUnitCost: 9200,
        totalCost: 55200,
        justification: 'Instrumentation for KNEC practical examinations.',
      },
    ],
    totalAmount: 148100,
  },
  {
    id: 'sample-budget-ict-2627',
    department: 'Informatics & ICT',
    financialYear: '2026/2027',
    title: 'Informatics & ICT Lab Equipment & Maintenance Budget',
    status: 'Approved' as const,
    submittedByName: 'ICT HOD (Demo)',
    reviewedByEmail: 'procurementertvc@gmail.com',
    reviewNotes: 'Approved under FY 2026/2027 capital & lab allocation.',
    notes: 'Covers lab workstation upgrades and UPS backup servicing.',
    lineItems: [
      {
        id: 'line-ict-1',
        category: 'Machinery & Capital Assets' as const,
        itemName: 'Business Core i5 Desktop Workstations',
        unit: 'Pcs',
        quantity: 3,
        estimatedUnitCost: 58000,
        totalCost: 174000,
        justification: 'Expand Computer Lab 2 capacity for Diploma trainees.',
      },
      {
        id: 'line-ict-2',
        category: 'Maintenance & Repairs' as const,
        itemName: 'Cat6 Networking Cables & Projector Lamps',
        unit: 'Lots',
        quantity: 2,
        estimatedUnitCost: 20500,
        totalCost: 41000,
        justification: 'Scheduled annual maintenance across ICT classrooms.',
      },
    ],
    totalAmount: 215000,
  },
  {
    id: 'sample-budget-agme-2627',
    department: 'AGME',
    financialYear: '2026/2027',
    title: 'AGME Fabrication & Welding Workshop Draft Budget',
    status: 'Draft' as const,
    submittedByName: 'AGME HOD (Demo)',
    reviewedByEmail: '',
    reviewNotes: '',
    notes: 'Draft pending HOD final review on electrode quantities.',
    lineItems: [
      {
        id: 'line-agme-1',
        category: 'Consumables & Training Materials' as const,
        itemName: 'Mild Steel Hollow Sections & Welding Electrodes',
        unit: 'Lots',
        quantity: 4,
        estimatedUnitCost: 24000,
        totalCost: 96000,
        justification: 'Core practical materials for fabrication & welding trainees.',
      },
    ],
    totalAmount: 96000,
  },
];

