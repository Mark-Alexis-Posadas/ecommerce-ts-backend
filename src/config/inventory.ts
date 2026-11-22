export function lowStockThreshold():number {
 const raw=process.env.INVENTORY_LOW_STOCK_THRESHOLD;
 if(!raw||!/^\d+$/.test(raw))return 5;
 const value=Number(raw);return Number.isSafeInteger(value)?value:5;
}
