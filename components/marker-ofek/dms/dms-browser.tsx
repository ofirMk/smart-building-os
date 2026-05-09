"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { he } from "date-fns/locale"
import {
  ChevronLeft,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
  FileText,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DmsUploadDialog } from "@/components/marker-ofek/dms/upload-dialog"
import {
  dmsCreateFolder,
  dmsGetDownloadUrl,
} from "@/lib/marker-ofek/dms/dms-actions"
import type {
  DmsBrowserBootstrap,
  DmsCapability,
  DmsDocumentSummary,
  DmsFolder,
} from "@/lib/marker-ofek/dms/dms-types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type FolderNode = DmsFolder & { children: FolderNode[] }

function buildFolderTree(folders: DmsFolder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>()
  folders.forEach((f) => byId.set(f.id, { ...f, children: [] }))
  const roots: FolderNode[] = []
  folders.forEach((f) => {
    const node = byId.get(f.id)
    if (!node) return
    if (f.parentFolderId && byId.has(f.parentFolderId)) {
      byId.get(f.parentFolderId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  /** Stable sort: SYSTEM folders first, then alpha. */
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind === "SYSTEM" && b.kind !== "SYSTEM") return -1
      if (a.kind !== "SYSTEM" && b.kind === "SYSTEM") return 1
      return a.name.localeCompare(b.name, "he")
    })
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const KIND_LABELS: Record<DmsDocumentSummary["documentKind"], string> = {
  PLAN: "תוכנית",
  PERMIT: "היתר",
  CERTIFICATE: "תעודה",
  CONTRACT: "חוזה",
  INVOICE: "חשבונית",
  DELIVERY_NOTE: "תעודת משלוח",
  CORRESPONDENCE: "מכתב",
  PHOTO: "תמונה",
  OTHER: "אחר",
}

const CONFIDENTIALITY_LABELS: Record<
  DmsDocumentSummary["confidentialityLevel"],
  string
> = {
  PUBLIC: "ציבורי",
  INTERNAL: "פנימי",
  RESTRICTED: "מוגבל",
  SECRET: "סודי",
}

type FolderTreeRowProps = {
  node: FolderNode
  depth: number
  expanded: Set<string>
  selectedId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

function FolderTreeRow({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: FolderTreeRowProps) {
  const isExpanded = expanded.has(node.id)
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onSelect(node.id)
          if (hasChildren) onToggle(node.id)
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-right text-sm transition-colors",
          "hover:bg-accent/60",
          isSelected && "bg-accent text-accent-foreground"
        )}
        style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
      >
        <ChevronLeft
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "-rotate-90",
            !hasChildren && "opacity-0"
          )}
        />
        {isExpanded && hasChildren ? (
          <FolderOpen className="size-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="size-4 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
        {node.kind === "SYSTEM" && (
          <Badge variant="secondary" className="ms-auto h-4 px-1 text-[10px]">
            ברירת מחדל
          </Badge>
        )}
      </button>
      {isExpanded &&
        node.children.map((child) => (
          <FolderTreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

export function DmsBrowser({ bootstrap }: { bootstrap: DmsBrowserBootstrap }) {
  const router = useRouter()
  const tree = React.useMemo(
    () => buildFolderTree(bootstrap.folders),
    [bootstrap.folders]
  )
  const [folders, setFolders] = React.useState<DmsFolder[]>(bootstrap.folders)
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    /** Auto-expand root folders so the user sees the structure immediately. */
    const s = new Set<string>()
    bootstrap.folders.forEach((f) => {
      if (!f.parentFolderId) s.add(f.id)
    })
    return s
  })
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(
    () => tree[0]?.id ?? null
  )
  const [documents, setDocuments] = React.useState<DmsDocumentSummary[]>([])
  const [docsLoading, setDocsLoading] = React.useState(false)
  const [docsError, setDocsError] = React.useState<string | null>(null)

  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [creatingFolder, setCreatingFolder] = React.useState(false)

  const capSet = React.useMemo(
    () => new Set<DmsCapability>(bootstrap.rootCapabilities),
    [bootstrap.rootCapabilities]
  )
  const canUpload = capSet.has("UPLOAD_VERSION") && Boolean(selectedFolderId)
  const canManage = capSet.has("MANAGE_ACL")
  const canDownload = capSet.has("DOWNLOAD")

  const selectedFolder = React.useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  )

  /** Lazy-load documents on folder change — direct browser query, RLS-scoped. */
  const reloadDocuments = React.useCallback(async () => {
    if (!selectedFolderId) {
      setDocuments([])
      return
    }
    setDocsLoading(true)
    setDocsError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("dms_documents")
        .select(
          `
          id, company_id, project_id, folder_id, title, document_kind, current_version_id,
          confidentiality_level, tags, created_at, updated_at,
          current_version:dms_document_versions!dms_documents_current_version_fk (
            id, document_id, version_number, storage_bucket, storage_path,
            mime_type, size_bytes, checksum_sha256, original_filename,
            uploaded_by, uploaded_at, change_note, is_quarantined, archived_at
          )
        `
        )
        .eq("folder_id", selectedFolderId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200)

      if (error) {
        setDocsError(error.message)
        setDocuments([])
        return
      }

      type RawVersion = {
        id: string
        document_id: string
        version_number: number
        storage_bucket: "project-dms" | "project-dms-restricted"
        storage_path: string
        mime_type: string
        size_bytes: number
        checksum_sha256: string
        original_filename: string
        uploaded_by: string | null
        uploaded_at: string
        change_note: string | null
        is_quarantined: boolean
        archived_at: string | null
      }
      type RawRow = {
        id: string
        company_id: string
        project_id: string
        folder_id: string
        title: string
        document_kind: DmsDocumentSummary["documentKind"]
        current_version_id: string | null
        confidentiality_level: DmsDocumentSummary["confidentialityLevel"]
        tags: string[] | null
        created_at: string
        updated_at: string
        current_version: RawVersion | RawVersion[] | null
      }
      const mapped: DmsDocumentSummary[] = (data ?? []).map((raw) => {
        const r = raw as unknown as RawRow
        const cvRaw = Array.isArray(r.current_version)
          ? r.current_version[0] ?? null
          : r.current_version ?? null
        const cv = cvRaw
          ? {
              id: cvRaw.id,
              documentId: cvRaw.document_id,
              versionNumber: cvRaw.version_number,
              storageBucket: cvRaw.storage_bucket,
              storagePath: cvRaw.storage_path,
              mimeType: cvRaw.mime_type,
              sizeBytes: cvRaw.size_bytes,
              checksumSha256: cvRaw.checksum_sha256,
              originalFilename: cvRaw.original_filename,
              uploadedBy: cvRaw.uploaded_by,
              uploadedAt: cvRaw.uploaded_at,
              changeNote: cvRaw.change_note,
              isQuarantined: cvRaw.is_quarantined,
              archivedAt: cvRaw.archived_at,
            }
          : null
        return {
          id: r.id,
          companyId: r.company_id,
          projectId: r.project_id,
          folderId: r.folder_id,
          title: r.title,
          documentKind: r.document_kind,
          currentVersionId: r.current_version_id,
          confidentialityLevel: r.confidentiality_level,
          tags: r.tags ?? [],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          currentVersion: cv,
        }
      })
      setDocuments(mapped)
    } catch (e) {
      setDocsError(formatError(e))
      setDocuments([])
    } finally {
      setDocsLoading(false)
    }
  }, [selectedFolderId])

  React.useEffect(() => {
    void reloadDocuments()
  }, [reloadDocuments])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onCreateFolder() {
    if (!selectedFolderId) return
    if (!newFolderName.trim()) {
      toast.error("הזן שם תיקייה")
      return
    }
    setCreatingFolder(true)
    try {
      const res = await dmsCreateFolder({
        parentFolderId: selectedFolderId,
        name: newFolderName.trim(),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("התיקייה נוצרה")
      setCreateFolderOpen(false)
      setNewFolderName("")
      router.refresh()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setCreatingFolder(false)
    }
  }

  async function onDownload(versionId: string) {
    try {
      const res = await dmsGetDownloadUrl({ versionId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      window.open(res.url, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast.error(formatError(e))
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-7xl flex-col gap-4 p-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Link
              href="/marker-ofek"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Marker-Ofek
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground">DMS</span>
          </div>
          <h1 className="text-xl font-semibold">{bootstrap.project.name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {bootstrap.project.projectCode && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {bootstrap.project.projectCode}
              </Badge>
            )}
            <span>{folders.length} תיקיות</span>
            <Separator orientation="vertical" className="h-3" />
            <Shield className="size-3" />
            <span>{capSet.size} הרשאות פעילות</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadDocuments()}
            disabled={docsLoading}
          >
            <RefreshCw
              className={cn("size-4", docsLoading && "animate-spin")}
            />
            רענון
          </Button>
          {canManage && selectedFolderId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateFolderOpen((v) => !v)}
            >
              <FolderPlus className="size-4" />
              תיקייה חדשה
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canUpload}
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="size-4" />
            העלאת קובץ
          </Button>
        </div>
      </div>

      {createFolderOpen && selectedFolder && (
        <Alert>
          <AlertTitle>תיקייה חדשה תחת "{selectedFolder.name}"</AlertTitle>
          <AlertDescription className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="שם תיקייה"
              className="max-w-xs"
              disabled={creatingFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreateFolder()
              }}
            />
            <Button size="sm" onClick={onCreateFolder} disabled={creatingFolder}>
              {creatingFolder && <Loader2 className="size-3.5 animate-spin" />}
              צור
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreateFolderOpen(false)
                setNewFolderName("")
              }}
            >
              ביטול
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Two-pane layout */}
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-4">
        {/* Folder tree */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            תיקיות
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-1">
              {tree.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  אין תיקיות נגישות
                </div>
              )}
              {tree.map((node) => (
                <FolderTreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  selectedId={selectedFolderId}
                  onToggle={toggleExpand}
                  onSelect={setSelectedFolderId}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Document list */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-medium">
              {selectedFolder ? selectedFolder.pathCache || selectedFolder.name : "בחר תיקייה"}
            </div>
            <div className="text-xs text-muted-foreground">
              {documents.length} מסמכים
            </div>
          </div>
          <ScrollArea className="flex-1">
            {docsError && (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertTitle>שגיאת טעינה</AlertTitle>
                  <AlertDescription>{docsError}</AlertDescription>
                </Alert>
              </div>
            )}

            {!docsError && docsLoading && documents.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                טוען מסמכים…
              </div>
            )}

            {!docsError && !docsLoading && documents.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <FileText className="size-8 opacity-30" />
                <div>אין מסמכים בתיקייה זו</div>
                {canUpload && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Upload className="size-3.5" />
                    העלאת קובץ ראשון
                  </Button>
                )}
              </div>
            )}

            {documents.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">סודיות</TableHead>
                    <TableHead className="text-right">גרסה</TableHead>
                    <TableHead className="text-right">גודל</TableHead>
                    <TableHead className="text-right">עודכן</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const v = doc.currentVersion
                    const quarantined = v?.isQuarantined ?? false
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="max-w-xs">
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{doc.title}</div>
                              {v?.originalFilename && v.originalFilename !== doc.title && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {v.originalFilename}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {KIND_LABELS[doc.documentKind]}
                        </TableCell>
                        <TableCell className="text-xs">
                          {CONFIDENTIALITY_LABELS[doc.confidentialityLevel]}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {v ? `v${v.versionNumber}` : "—"}
                          {quarantined && (
                            <Badge
                              variant="secondary"
                              className="ms-1 h-4 px-1 text-[10px]"
                            >
                              בהסגר
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {v ? formatBytes(v.sizeBytes) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(doc.updatedAt), "dd MMM HH:mm", {
                            locale: he,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canDownload || !v || quarantined}
                            onClick={() => v && onDownload(v.id)}
                          >
                            <Download className="size-3.5" />
                            הורדה
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </div>

      {selectedFolder && (
        <DmsUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          folder={selectedFolder}
          onUploaded={() => {
            void reloadDocuments()
          }}
        />
      )}
    </div>
  )
}
