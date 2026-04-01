import { NextRequest, NextResponse } from "next/server"

type Company = "marker_ofek" | "holden_group" | "none"

function normalizeCompany(value: string): Company | null {
  if (value === "marker_ofek") return "marker_ofek"
  if (value === "holden_group") return "holden_group"
  if (value === "none") return "none"
  return null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ company: string }> }
) {
  const { company: raw } = await context.params
  const company = normalizeCompany(raw)
  if (!company) {
    return NextResponse.redirect(new URL("/", _request.url))
  }

  const target =
    company === "none"
      ? "/"
      : company === "marker_ofek"
        ? "/marker-ofek"
        : "/dashboard/holden"
  const res = NextResponse.redirect(new URL(target, _request.url))
  if (company === "none") {
    res.cookies.set("selected_company", "", {
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    })
  } else {
    res.cookies.set("selected_company", company, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
    })
  }
  return res
}
