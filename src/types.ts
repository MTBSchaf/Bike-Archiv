export type TabKey = 'bikes' | 'parts' | 'orders';

export type PartCategory =
  | 'Rahmen'
  | 'Fahrwerk'
  | 'Antrieb'
  | 'Bremsen'
  | 'Laufräder & Reifen'
  | 'Cockpit & Sattel'
  | 'Sonstiges';

export const PART_CATEGORIES: PartCategory[] = [
  'Rahmen',
  'Fahrwerk',
  'Antrieb',
  'Bremsen',
  'Laufräder & Reifen',
  'Cockpit & Sattel',
  'Sonstiges',
];

export type PartStatus = 'in_use' | 'in_stock' | 'defective';

export type OrderPriority = 'low' | 'normal' | 'high';
export type OrderStatus = 'open' | 'ordered' | 'received';

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
  specs: string;
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
  notes: string;
  serials?: Array<{ label: string; serialNumber: string; notes: string }>;
}

export interface PartFormInput {
  name: string;
  brand: string;
  category: PartCategory;
  specs: string;
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
  status: OrderStatus;
  notes: string;
}
