// app/api/suppliers/route.ts

// הגדרות סטטיות חובה עבור Turbopack / Next.js 16
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ייצוא ה-Handlers בלבד מהלוגיקה המשותפת
export { GET, POST } from "@/app/api/master-data/suppliers/route";

