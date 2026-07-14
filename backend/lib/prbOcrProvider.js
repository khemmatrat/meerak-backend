/**
 * PRB registration book OCR — mock v1, swappable for real provider later.
 */

const MOCK_BRANDS = ['Toyota', 'Honda', 'Mazda', 'Nissan', 'Isuzu', 'Ford', 'BMW', 'Mercedes-Benz'];
const MOCK_MODELS = ['Corolla', 'Civic', 'CX-5', 'Almera', 'D-Max', 'Ranger', '318i', 'C200'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mockPlate() {
  const letters = 'กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
  const a = letters[Math.floor(Math.random() * letters.length)];
  const b = letters[Math.floor(Math.random() * letters.length)];
  const num = String(1000 + Math.floor(Math.random() * 8999));
  return `${a}${b}-${num}`;
}

/**
 * @param {{ imageUrl: string, userId?: string }} params
 */
export async function extractVehicleRegistration({ imageUrl, userId }) {
  const brand = pick(MOCK_BRANDS);
  const model = pick(MOCK_MODELS);
  const year = 2015 + Math.floor(Math.random() * 10);
  const chassis = `CH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const registrationNumber = mockPlate();

  return {
    ok: true,
    provider: 'mock',
    confidence: 0.72,
    imageUrl: imageUrl || null,
    registration_number: registrationNumber,
    registration_province: 'กรุงเทพมหานคร',
    chassis_number: chassis,
    chassis_search_7: chassis.slice(-7),
    vehicle_brand: brand,
    vehicle_model: model,
    vehicle_year: year,
    registration_year: year,
    engine_cc: brand === 'BMW' ? 1800 : 1500,
    vehicle_weight_kg: 1500,
    seat_count: 5,
    car_type: 'sedan',
    full_name: null,
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    national_id: null,
  };
}
