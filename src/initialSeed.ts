import type { BikeFormInput, PartCategory } from './types.ts';

export const SPECIALIZED_STATUS_160_ID = 'bike-specialized-status-160';

export const SPECIALIZED_STATUS_160_BIKE: BikeFormInput = {
  name: 'Specialized Status 160',
  brand: 'Specialized',
  model: 'Status 160',
  modelYear: 2022,
  category: 'Enduro / Trail',
  frameSize: 'S3',
  wheelSize: '29" / 27.5" Mullet',
  color: 'Satin Cast Umber / Clay',
  serialNumber: '',
  notes: 'Mixed-Wheel Mullet Aufbau (29" vorne / 27.5" hinten), 160 mm Federweg.',
};

export const SPECIALIZED_STATUS_160_PARTS: Array<{
  category: PartCategory;
  name: string;
  brand: string;
  specs: string;
}> = [
  {
    category: 'Rahmen',
    name: 'Specialized Status 160 M5 Alloy Rahmen',
    brand: 'Specialized',
    specs:
      'M5 Aluminium, Mixed-Wheel Trail-Geometrie (29"/27.5"), 160 mm Federweg, BSA 73 mm, 12x148 mm Boost, Flip-Chip',
  },
  {
    category: 'Rahmen',
    name: 'Specialized Sattelklemme',
    brand: 'Specialized',
    specs: 'Aluminium, 38,6 mm',
  },
  {
    category: 'Fahrwerk',
    name: 'FOX FLOAT 36 Rhythm',
    brand: 'FOX',
    specs:
      '160 mm Federweg, GRIP-Dämpfer, 2-Position Sweep, 15x110 mm QR-Steckachse, 44 mm Offset',
  },
  {
    category: 'Fahrwerk',
    name: 'FOX FLOAT X Performance',
    brand: 'FOX',
    specs:
      'Rx Trail Tune, EVOL-Luftkammer, 2-Position-Hebel mit LSR-Verstellung, 230x60 mm',
  },
  {
    category: 'Antrieb',
    name: 'SRAM NX Eagle Schaltwerk',
    brand: 'SRAM',
    specs: '12-fach',
  },
  {
    category: 'Antrieb',
    name: 'SRAM NX Eagle Schalthebel',
    brand: 'SRAM',
    specs: 'Trigger, 12-fach',
  },
  {
    category: 'Antrieb',
    name: 'SRAM NX Eagle Kassette',
    brand: 'SRAM',
    specs: '12-fach, 11–50 Zähne',
  },
  {
    category: 'Antrieb',
    name: 'SRAM NX Eagle Kette',
    brand: 'SRAM',
    specs: '12-fach',
  },
  {
    category: 'Antrieb',
    name: 'SRAM NX Eagle Kurbelgarnitur',
    brand: 'SRAM',
    specs: 'DUB, 170 mm, 32T Stahl-Kettenblatt',
  },
  {
    category: 'Antrieb',
    name: 'SRAM DUB Innenlager',
    brand: 'SRAM',
    specs: 'BSA 73 mm, geschraubt',
  },
  {
    category: 'Bremsen',
    name: 'SRAM Code R Vorderradbremse',
    brand: 'SRAM',
    specs: '4-Kolben-Bremssattel, hydraulische Scheibenbremse, 200 mm Bremsscheibe',
  },
  {
    category: 'Bremsen',
    name: 'SRAM Code R Hinterradbremse',
    brand: 'SRAM',
    specs: '4-Kolben-Bremssattel, hydraulische Scheibenbremse, 200 mm Bremsscheibe',
  },
  {
    category: 'Laufräder & Reifen',
    name: 'Specialized Alloy Vorderrad 29"',
    brand: 'Specialized',
    specs:
      'Hookless Aluminium, 30 mm Maulweite, Tubeless Ready, 15x110 mm Boost-Nabe, 28 Loch, DT Swiss Industry Speichen',
  },
  {
    category: 'Laufräder & Reifen',
    name: 'Specialized Alloy Hinterrad 27.5"',
    brand: 'Specialized',
    specs:
      'Hookless Aluminium, 30 mm Maulweite, Tubeless Ready, 12x148 mm Boost-Nabe, 28 Loch, DT Swiss Industry Speichen',
  },
  {
    category: 'Laufräder & Reifen',
    name: 'Specialized Butcher GRID TRAIL Vorderreifen',
    brand: 'Specialized',
    specs: 'GRIPTON-Mischung, 29x2.3"',
  },
  {
    category: 'Laufräder & Reifen',
    name: 'Specialized Butcher GRID TRAIL Hinterreifen',
    brand: 'Specialized',
    specs: 'GRIPTON-Mischung, 27.5x2.3"',
  },
  {
    category: 'Cockpit & Sattel',
    name: 'Specialized 6061 Alloy Lenker',
    brand: 'Specialized',
    specs: '800 mm Breite, 30 mm Rise, 6° Upsweep, 8° Backsweep, 35 mm Klemmung',
  },
  {
    category: 'Cockpit & Sattel',
    name: 'Specialized Alloy Trail Vorbau',
    brand: 'Specialized',
    specs: '40 mm Länge, 35 mm Lenkerklemmung',
  },
  {
    category: 'Cockpit & Sattel',
    name: 'Deity Knuckleduster Griffe',
    brand: 'Deity',
    specs: 'Schwarz, Lock-On',
  },
  {
    category: 'Cockpit & Sattel',
    name: 'Body Geometry Bridge Comp Sattel',
    brand: 'Specialized',
    specs: 'Hollow Cr-Mo Streben, 143 mm',
  },
  {
    category: 'Cockpit & Sattel',
    name: 'X-Fusion Manic Dropper Sattelstütze',
    brand: 'X-Fusion',
    specs: '34,9 mm, stufenlos absenkbar, 170 mm Hub (S3), SLR LE Remote-Hebel',
  },
];
