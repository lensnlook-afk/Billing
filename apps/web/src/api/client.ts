export type User={id:string;loginName:string;displayName:string;roles:string[];permissions:string[]};
const apiBase='';
const request=async<T>(path:string,init:RequestInit={})=>{const response=await fetch(`${apiBase}${path}`,{credentials:'include',headers:{'content-type':'application/json',...init.headers},...init});if(response.status===204)return undefined as T;const isJson=response.headers.get('content-type')?.includes('application/json');const payload=isJson?await response.json():null;if(!response.ok){if(!isJson)throw new Error('The secure login server is not connected yet.');throw new Error(payload.error?.message??'Request failed')}return payload as T};

// ── In-memory cache for read-heavy endpoints ──────────────────────
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 30_000; // 30 s
async function cachedRequest<T>(path: string): Promise<T> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && now - hit.ts < TTL) return hit.data as T;
  const data = await request<T>(path);
  cache.set(path, { data, ts: now });
  return data;
}
export function bustCache(prefix?: string) {
  if (!prefix) { cache.clear(); return; }
  for (const k of cache.keys()) { if (k.startsWith(prefix)) cache.delete(k); }
}

export const api={
  login:(identifier:string,password:string)=>request<{user:User}>('/api/v1/auth/login',{method:'POST',body:JSON.stringify({identifier,password})}),
  logout:()=>request<void>('/api/v1/auth/logout',{method:'POST'}),
  me:()=>request<{user:User}>('/api/v1/auth/me'),
  dashboard:()=>cachedRequest<{today:{sales:string;collections:string;outstanding:string;invoices:string};lowStock:number}>('/api/v1/dashboard'),
  products:(q='')=>q ? request<{data:Product[]}>(`/api/v1/products?q=${encodeURIComponent(q)}`) : cachedRequest<{data:Product[]}>('/api/v1/products?q='),
  customers:(q='')=>request<{data:Customer[]}>(`/api/v1/customers?q=${encodeURIComponent(q)}`),
  locations:()=>cachedRequest<{data:Location[]}>('/api/v1/locations'),
  createCustomer:(data:{fullName:string;phone?:string})=>request<{data:Customer}>('/api/v1/customers',{method:'POST',body:JSON.stringify(data)}),
  postInvoice:(data:unknown,key:string)=>{bustCache('/api/v1/products');return request<{data:InvoiceReply}>('/api/v1/invoices',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(data)})},
};
export type Product={id:string;sku:string;barcode?:string;name:string;variant?:string;color?:string;size?:string;selling_price:string;tax_rate:string;stock:number}; export type Customer={id:string;customer_code:string;full_name:string;phone?:string;email?:string}; export type Location={id:string;code:string;name:string}; export type InvoiceReply={invoiceId:string;invoiceNumber:string;grandTotal:string;amountPaid:string;amountDue:string;paymentStatus:string};
