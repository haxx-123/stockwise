import { Store, Product, Batch } from './types';

export const STORES: Store[] = [
  { id: 'store_1', name: '总店 (市中心)', location: '主干道 123 号' },
  { id: 'store_2', name: '西区分店', location: '西大街 456 号' },
  { id: 'store_3', name: '机场柜台', location: '1 号航站楼' },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_1',
    name: '维生素C 1000mg',
    sku: 'VIT-C-1000',
    category: '保健品',
    unit_name: '箱',
    split_unit_name: '瓶',
    split_ratio: 12,
    min_stock_level: 24, // 2 Cases
  },
  {
    id: 'prod_2',
    name: '布洛芬缓释胶囊 200mg',
    sku: 'IBU-200',
    category: '药品',
    unit_name: '大盒',
    split_unit_name: '板',
    split_ratio: 10,
    min_stock_level: 50, // 5 Boxes
  },
  {
    id: 'prod_3',
    name: '天然矿泉水 500ml',
    sku: 'WAT-500',
    category: '饮料',
    unit_name: '箱',
    split_unit_name: '瓶',
    split_ratio: 24,
    min_stock_level: 48,
  },
  {
    id: 'prod_4',
    name: '能量蛋白棒',
    sku: 'PRO-BAR-CHO',
    category: '零食',
    unit_name: '盒',
    split_unit_name: '根',
    split_ratio: 12,
    min_stock_level: 36,
  }
];

// Helper to generate initial batches for demo
const generateBatches = (): Batch[] => {
  const batches: Batch[] = [];
  const now = new Date();
  
  // Product 1: Mix of stores and expiries
  batches.push({
    id: 'batch_1', product_id: 'prod_1', store_id: 'store_1', batch_number: 'B2023001',
    quantity: 30, // 2 Cases + 6 Bottles
    expiry_date: new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString(), // Expires soon
    created_at: now.toISOString()
  });
  batches.push({
    id: 'batch_2', product_id: 'prod_1', store_id: 'store_1', batch_number: 'B2023005',
    quantity: 120, // 10 Cases
    expiry_date: new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString(),
    created_at: now.toISOString()
  });

  // Product 2
  batches.push({
    id: 'batch_3', product_id: 'prod_2', store_id: 'store_1', batch_number: 'IB-99',
    quantity: 5, // 5 Strips (Low stock!)
    expiry_date: new Date(now.getFullYear(), now.getMonth() + 6, 1).toISOString(),
    created_at: now.toISOString()
  });

  return batches;
};

export const INITIAL_BATCHES = generateBatches();