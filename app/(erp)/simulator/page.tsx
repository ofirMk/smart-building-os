import { Cpu } from "lucide-react"
import { IotSimulator } from "@/components/erp/simulator/iot-simulator"

export default function SimulatorPage() {
  return (
    <main className="min-h-screen bg-slate-50 pb-16" dir="rtl">
      <header className="border-b bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">IoT Event Simulator</h1>
            <p className="text-xs text-muted-foreground">
              שלח אירועי IoT מדומים לצינור האירועים — ללא חומרה פיזית
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        <IotSimulator />
      </div>
    </main>
  )
}
