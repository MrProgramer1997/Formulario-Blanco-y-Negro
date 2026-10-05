// Configuration only. NEVER add ePayco secrets or a Supabase service_role here.
export const CONFIG = Object.freeze({
  preview: false, // Production form. Event enable flag controls commercial launch.
  paymentEnvironment: 'live',
  defaultTestCase: 'T1500',
  apiUrl: 'https://cmrydhzpcuklfvigboka.supabase.co/functions/v1/bn2026-api',
  liveApiUrl: 'https://cmrydhzpcuklfvigboka.supabase.co/functions/v1/bn2026-live-api',
  authUrl: 'https://cmrydhzpcuklfvigboka.supabase.co/auth/v1',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtcnlkaHpwY3VrbGZ2aWdib2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzU1NDIsImV4cCI6MjA3ODExMTU0Mn0.SzLh-CoahU63AISJwPKJLJkAf-JQ2qxAwUt69NsPKgQ',
  eventSlug: 'blanco-negro-2026',
  version: '2026.10.03-live-launch-review.1',
});
export const EVENT = Object.freeze({
  name: 'Fiesta Blanco y Negro', date: '2026-11-06',
  memberPrice: 180000, guestPrice: 260000,
  minGuests: 8, maxGuests: 10,
  bookingDeadline: '2026-10-30', refundDeadline: '2026-10-23',
});
export const TEST_CASES = Object.freeze([
  { code: 'T1000', amount: 1000 }, { code: 'T1500', amount: 1500 },
  { code: 'T3000', amount: 3000 }, { code: 'T5500', amount: 5500 },
]);
// Centers measured on the supplied map; coordinates are independent of viewport size.
const centers = [
 [1,46.65,23.5],[2,91.25,22.45],[3,46.65,32.9],[4,53.9,31.45],
 [5,85.55,31.45],[6,91.25,29.9],[7,53.9,38.8],[8,61.05,38.8],
 [9,68.15,38.8],[10,75.25,38.8],[11,82.3,38.8],[12,89.4,38.8],
 [13,53.9,45.3],[14,61.05,45.3],[15,68.15,45.3],[16,75.25,45.3],
 [17,82.3,45.3],[18,89.4,45.3],[19,53.9,51.55],[20,61.05,51.55],
 [21,68.15,51.55],[22,75.25,51.55],[23,53.9,58.15],[24,61.05,58.15],
 [25,68.15,58.15],[26,75.25,58.15],[27,61.05,65.6],[28,68.15,65.6],
 [29,75.25,65.6],[30,82.3,65.6],[31,54.85,72.75],[32,63.25,72.75],
 [33,72.05,72.75],[34,24.9,48.75],[35,24.9,53.95],[36,24.9,59.0],
 [37,18.5,48.75],[38,18.5,53.95],[39,18.5,59.0],[40,12.2,51.25],
 [41,12.2,56.35],[42,12.2,61.5],[43,6.05,48.75],[44,6.05,53.95],[45,6.05,59.0],
];
export const TABLES = centers.map(([number,x,y]) => ({number,x,y,zone:number<=33?'Rialto':'Lobby',capacity:10,status:'available'}));
