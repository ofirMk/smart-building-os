"use client"

import Link from "next/link"
import { ArrowLeft, Building2, Users } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NewContractSelectionPage() {
  return (
    <div
      className="flex min-h-[80vh] flex-col items-center justify-center bg-slate-50 p-6"
      dir="rtl"
    >
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
          סוג חוזה חדש
        </h1>
        <p className="mt-4 text-lg text-slate-500">
          בחר את נתיב ההתקשרות עבור הפרויקט
        </p>
      </div>

      <div className="grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
        <Link href="/marker-ofek/contracts/create-client" className="group">
          <Card className="h-full border-2 bg-white transition-all hover:border-blue-500 hover:shadow-xl">
            <CardHeader>
              <div className="mb-4 w-fit rounded-2xl bg-blue-50 p-4 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <Building2 className="h-10 w-10" aria-hidden />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-800">
                חוזה מזמין (לקוח)
              </CardTitle>
              <CardDescription className="text-base text-slate-500">
                התקשרות מול יזם או קבלן ראשי (כגון אל-הר, תדהר). התמקדות בתנאי
                תשלום ולו&quot;ז כללי.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 font-bold text-blue-600">
              <span>הקם חוזה מזמין</span>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            </CardContent>
          </Card>
        </Link>

        <Link href="/marker-ofek/contracts/create-subcontractor" className="group">
          <Card className="h-full border-2 bg-white transition-all hover:border-green-500 hover:shadow-xl">
            <CardHeader>
              <div className="mb-4 w-fit rounded-2xl bg-green-50 p-4 transition-colors group-hover:bg-green-600 group-hover:text-white">
                <Users className="h-10 w-10" aria-hidden />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-800">
                חוזה קבלן / ספק
              </CardTitle>
              <CardDescription className="text-base text-slate-500">
                התקשרות מול קבלני משנה וספקים. התמקדות ב-Back-to-Back,
                חומר/ביצוע וקיזוזים.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 font-bold text-green-600">
              <span>הקם חוזה קבלן</span>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
