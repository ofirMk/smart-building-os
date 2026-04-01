import { ErpModuleHub } from "@/components/marker-ofek/erp-module-hub"

/** דשבורד ראשי — מרכז פיקוד מודולרי של מרקר אופק */
export default function MarkerOfekCommandCenterPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-6 md:py-8">
      <ErpModuleHub />
    </div>
  )
}
