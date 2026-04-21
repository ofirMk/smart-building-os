export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { GET as getHandler, POST as postHandler } from "./material-deductions-logic"

export const GET = getHandler
export const POST = postHandler
