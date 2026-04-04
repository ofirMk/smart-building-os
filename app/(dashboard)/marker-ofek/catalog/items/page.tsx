import { redirect } from "next/navigation"

/** נתיב MDM גלובלי — מפנה לגיליון הפריטים הקיים */
export default function CatalogItemsMdmRedirectPage() {
  redirect("/marker-ofek/items")
}
