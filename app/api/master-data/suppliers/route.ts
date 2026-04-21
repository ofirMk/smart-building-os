export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { GET as getHandler, POST as postHandler } from "./suppliers-logic"

export const GET = getHandler
export const POST = postHandler

