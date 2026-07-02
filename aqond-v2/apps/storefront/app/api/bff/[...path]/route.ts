import { NextRequest, NextResponse } from 'next/server';
import { loadHomeProducts } from '@/lib/server/homeProducts';
import { addLocalCartItem, getLocalCart, mergeLocalCarts, setShopCartItemQty } from '@/lib/server/localCart';
import { addLocalAddress, listLocalAddresses } from '@/lib/server/localAddress';
import { listNearbyRestaurants, getRestaurantMenu } from '@/lib/server/localFood';
import { addFoodCartItem, clearFoodCart, getFoodCart, setFoodDeliveryMode, setFoodCartItemQty } from '@/lib/server/localFoodCart';
const BFF = (process.env.BFF_URL || 'http://127.0.0.1:8000/api/v2/merchant').replace(/\/$/, '');

function forwardHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Aqond-Region': req.headers.get('x-aqond-region') || req.headers.get('X-Aqond-Region') || 'TH',
  };
  const uid = req.headers.get('x-user-id') || req.headers.get('X-User-Id');
  const sid = req.headers.get('x-session-id') || req.headers.get('X-Session-Id');
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const lang = req.headers.get('accept-language') || req.headers.get('Accept-Language');
  if (uid) h['X-User-Id'] = uid;
  if (sid) h['X-Session-Id'] = sid;
  if (auth) h['Authorization'] = auth;
  if (lang) h['Accept-Language'] = lang;
  return h;
}

function preferLocalFoodCart(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1'
  );
}

function preferLocalShopCart(): boolean {
  return preferLocalFoodCart();
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = `${BFF}/${path}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders(req),
    cache: 'no-store',
  };
  let bodyText = '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyText = await req.text();
    init.body = bodyText;
  }

  if (preferLocalFoodCart() && path.startsWith('v1/food/cart')) {
    const local = await tryLocalBff(path, req, init.method, bodyText);
    if (local) return local;
  }

  if (preferLocalShopCart() && path.startsWith('v1/cart')) {
    const local = await tryLocalBff(path, req, init.method, bodyText);
    if (local) return local;
  }

  if (
    preferLocalShopCart() &&
    (path === 'v1/checkout' || path.startsWith('v1/checkout?') || path === 'v1/wallet' || path.startsWith('v1/wallet?'))
  ) {
    const local = await tryLocalBff(path, req, init.method, bodyText);
    if (local) return local;
  }

  try {
    const res = await fetch(url, init);
    const body = await res.text();
    if (!res.ok) {
      const local = await tryLocalBff(path, req, init.method, bodyText);
      if (local) return local;
    }
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: any) {
    const local = await tryLocalBff(path, req, init.method, bodyText);
    if (local) return local;
    return NextResponse.json({ error: 'bff_unreachable', detail: e.message }, { status: 502 });
  }
}

async function tryLocalBff(
  path: string,
  req: NextRequest,
  method = 'GET',
  bodyText = '',
): Promise<NextResponse | null> {
  const localDev =
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1';

  const owner = req.headers.get('x-user-id') || req.headers.get('X-User-Id') || 'guest';

  if (path === 'v1/home') {
    const products = await loadHomeProducts();
    return NextResponse.json({
      products: { products },
      region: 'TH',
      source: 'local-merged',
    });
  }

  if (path === 'v1/food/home') {
    const { buildFoodHomeFeed } = await import('@/lib/server/foodHomeFeed');
    const sort = new URL(req.url).searchParams.get('sort') === 'rating' ? 'rating' : 'distance';
    const feed = await buildFoodHomeFeed({ sort });
    return NextResponse.json({ ...feed, source: 'local-dev' });
  }

  if (path === 'v1/food/nearby') {
    const sort = new URL(req.url).searchParams.get('sort') === 'rating' ? 'rating' : 'distance';
    const restaurants = await listNearbyRestaurants({ sort });
    return NextResponse.json({ restaurants, source: 'local-dev' });
  }

  if (path.startsWith('v1/food/menu')) {
    const merchantId = new URL(req.url).searchParams.get('merchant_id') || '';
    const data = await getRestaurantMenu(merchantId);
    if (!data) return NextResponse.json({ error: 'restaurant_not_found' }, { status: 404 });
    return NextResponse.json({ ...data, source: 'local-dev' });
  }

  if (path.startsWith('v1/food/cart')) {
    const qOwner = new URL(req.url).searchParams.get('owner_id') || owner;
    if (method === 'POST' && path === 'v1/food/cart/items/qty') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const cart = await setFoodCartItemQty(body.owner_id || owner, {
          merchant_id: body.merchant_id,
          item_id: body.item_id,
          options: body.options,
          qty: Number(body.qty),
        });
        return NextResponse.json({ ...cart, owner_id: body.owner_id || owner });
      } catch {
        return NextResponse.json({ error: 'food_cart_qty_failed' }, { status: 400 });
      }
    }
    if (method === 'POST' && path === 'v1/food/cart/items') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const cart = await addFoodCartItem(body.owner_id || owner, {
          merchant_id: body.merchant_id,
          item_id: body.item_id,
          title: body.title,
          description: body.description,
          image_url: body.image_url,
          qty: body.qty || 1,
          unit_price_micro: body.unit_price_micro || 0,
          options: body.options,
        });
        return NextResponse.json({ ...cart, owner_id: body.owner_id || owner });
      } catch {
        return NextResponse.json({ error: 'food_cart_add_failed' }, { status: 400 });
      }
    }
    if (method === 'POST' && path === 'v1/food/cart/delivery-mode') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const mode = body.delivery_mode || 'normal';
        const cart = await setFoodDeliveryMode(body.owner_id || owner, mode);
        return NextResponse.json({ ...cart, owner_id: body.owner_id || owner });
      } catch {
        return NextResponse.json({ error: 'delivery_mode_failed' }, { status: 400 });
      }
    }
    if (method === 'POST' && path === 'v1/food/cart/clear') {
      const body = bodyText ? JSON.parse(bodyText) : {};
      const cart = await clearFoodCart(body.owner_id || owner);
      return NextResponse.json({ ...cart, owner_id: body.owner_id || owner });
    }
    const cart = await getFoodCart(qOwner);
    return NextResponse.json({ ...cart, owner_id: qOwner });
  }

  if (path === 'v1/account/address' && method === 'POST') {
    try {
      const body = bodyText ? JSON.parse(bodyText) : {};
      const oid = body.owner_id || owner;
      const addr = await addLocalAddress(oid, {
        recipient: body.recipient || '',
        phone: body.phone || '',
        line1: body.line1 || '',
        city: body.city,
        postal_code: body.postal_code || '',
        country: body.country,
        label: body.label,
        is_default: body.is_default,
      });
      return NextResponse.json({ address_id: addr.id, address: addr, source: 'local-dev' });
    } catch {
      return NextResponse.json({ error: 'address_save_failed' }, { status: 400 });
    }
  }

  if (path === 'v1/account' || path.startsWith('v1/account?')) {
    const qOwner = new URL(req.url).searchParams.get('user_id') || owner;
    const addresses = await listLocalAddresses(qOwner);
    return NextResponse.json({
      addresses: { addresses },
      owner_id: qOwner,
      source: 'local-dev',
    });
  }

  if (path === 'v1/checkout' || path.startsWith('v1/checkout?')) {
    const qOwner = new URL(req.url).searchParams.get('owner_id') || owner;
    const addresses = await listLocalAddresses(qOwner);
    return NextResponse.json({
      addresses: { addresses },
      owner_id: qOwner,
      source: 'local-dev',
    });
  }

  if (path.startsWith('v1/cart')) {
    if (method === 'POST' && path === 'v1/cart/items') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const cart = await addLocalCartItem(body.owner_id || owner, {
          product_id: body.product_id,
          title: body.title,
          qty: body.qty || 1,
          unit_price_micro: body.unit_price_micro || 0,
          merchant_id: body.merchant_id,
          source: body.source,
        });
        return NextResponse.json(cart);
      } catch {
        return NextResponse.json({ error: 'cart_add_failed' }, { status: 400 });
      }
    }
    if (method === 'POST' && path === 'v1/cart/items/qty') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const cart = await setShopCartItemQty(
          body.owner_id || owner,
          String(body.product_id || ''),
          Number(body.qty),
        );
        return NextResponse.json(cart);
      } catch {
        return NextResponse.json({ error: 'cart_qty_failed' }, { status: 400 });
      }
    }
    if (method === 'POST' && path === 'v1/cart/merge') {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const result = await mergeLocalCarts(String(body.guest_id || ''), String(body.user_id || ''));
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ error: 'cart_merge_failed' }, { status: 400 });
      }
    }
    const qOwner = new URL(req.url).searchParams.get('owner_id') || owner;
    const cart = await getLocalCart(qOwner);
    return NextResponse.json({ ...cart, owner_id: qOwner });
  }
  if (path === 'v1/wallet' || path.startsWith('v1/wallet?')) {
    const qOwner = new URL(req.url).searchParams.get('owner_id') || owner;
    return NextResponse.json({
      balance_micro: 125_000,
      coins: 50,
      coupons: [{ code: 'WALLET10', label: 'ลด ฿10 จากกระเป๋า' }],
      owner_id: qOwner,
      source: 'local-dev',
    });
  }
  if (path.startsWith('v1/product')) {
    const payload = await buildLocalHomePayload();
    const id = new URL(req.url).searchParams.get('id');
    const hit = (payload.products?.products || []).find((p: { id: string }) => p.id === id);
    if (hit) {
      return NextResponse.json({ product: hit, price: { price_micro: hit.price_micro }, source: 'local-dev' });
    }
  }

  return null;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
