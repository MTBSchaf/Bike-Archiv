export type TabKey = 'bikes' | 'parts' | 'orders';
export type ThemeMode = 'light' | 'dark';

export type PartCategory =
  | 'Rahmen'
  | 'Fahrwerk'
  | 'Antrieb'
  | 'Bremsen'
  | 'Laufräder & Reifen'
  | 'Cockpit & Sattel'
  | 'Lager & Achsen'
  | 'Schrauben & Kleinteile'
  | 'Sonstiges';

export const PART_CATEGORIES: PartCategory[] = [
  'Rahmen',
  'Fahrwerk',
  'Antrieb',
  'Bremsen',
  'Laufräder & Reifen',
  'Cockpit & Sattel',
  'Lager & Achsen',
  'Schrauben & Kleinteile',
  'Sonstiges',
];

export type PartStatus = 'in_use' | 'in_stock' | 'defective';

export type OrderPriority = 'low' | 'normal' | 'high';
export type OrderStatus = 'open' | 'ordered' | 'received';

export interface StructuredSpec {
  label: string;
  value: string;
}

export interface BikeSerial {
  id: string;
  bikeId: string;
  label: string;
  serialNumber: string;
  notes: string;
  createdAt: string;
}

export interface Part {
  id: string;
  name: string;
  brand: string;
  category: PartCategory;
  subCategory: string;
  partNumber: string;
  quantity: number;
  specs: string;
  structuredSpecs: StructuredSpec[];
  manufacturerUrl: string;
  imageUrl: string;
  catalogKey: string;
  serialNumber: string;
  status: PartStatus;
  bikeId: string | null;
  bikeName: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bike {
  id: string;
  name: string;
  brand: string;
  model: string;
  modelYear: number | null;
  category: string;
  frameSize: string;
  wheelSize: string;
  color: string;
  serialNumber: string;
  imageUrl: string;
  manufacturerUrl: string;
  notes: string;
  partCount: number;
  serials: BikeSerial[];
  parts?: Part[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  name: string;
  brand: string;
  category: PartCategory;
  bikeId: string | null;
  bikeName: string | null;
  partId: string | null;
  quantity: number;
  priority: OrderPriority;
  estimatedPrice: number | null;
  shopUrl: string;
  imageUrl: string;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BootstrapPayload {
  bikes: Bike[];
  parts: Part[];
  orderItems: OrderItem[];
}

export interface BikeFormInput {
  name: string;
  brand: string;
  model: string;
  modelYear: number | null;
  category: string;
  frameSize: string;
  wheelSize: string;
  color: string;
  serialNumber: string;
  imageUrl: string;
  manufacturerUrl: string;
  notes: string;
  serials?: Array<{ label: string; serialNumber: string; notes: string }>;
}

export interface PartFormInput {
  name: string;
  brand: string;
  category: PartCategory;
  subCategory: string;
  partNumber: string;
  quantity: number;
  specs: string;
  structuredSpecs: StructuredSpec[];
  manufacturerUrl: string;
  imageUrl: string;
  catalogKey?: string;
  serialNumber: string;
  status: PartStatus;
  bikeId: string | null;
  notes: string;
}

export interface OrderFormInput {
  name: string;
  brand: string;
  category: PartCategory;
  bikeId: string | null;
  partId: string | null;
  quantity: number;
  priority: OrderPriority;
  estimatedPrice: number | null;
  shopUrl: string;
  imageUrl: string;
  status: OrderStatus;
  notes: string;
}

export interface UpdateHistoryEntry {
  id: string;
  updateType: string;
  version: string;
  description: string;
  details: string;
  appliedAt: string;
}

export interface SystemStatus {
  appVersion: string;
  schemaVersion: string;
  catalogVersion: string;
  latestCatalogVersion: string;
  catalogUpdatePending: boolean;
  git: {
    available: boolean;
    commit: string | null;
    branch: string;
  };
  updateHistory: UpdateHistoryEntry[];
}

export interface UpdateCheckResult {
  checkedAt: string;
  currentVersion: string;
  branch: string;
  currentCommit: string | null;
  latestCommit: string | null;
  upToDate: boolean;
  updateAvailable: boolean;
  offline: boolean;
  message: string;
  updateCommand: string;
}

export interface ApplyUpdateResponse extends BootstrapPayload {
  mode: 'catalog' | 'package';
  result: {
    applied?: boolean;
    version?: string;
    bikesAdded?: number;
    bikesUpdated?: number;
    partsAdded?: number;
    partsUpdated?: number;
    ordersAdded?: number;
    bikeUpdated?: boolean;
  };
  systemStatus: SystemStatus;
}
