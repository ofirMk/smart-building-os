"use client"

import Link from "next/link"
import { ArrowRightLeft, ChevronDown } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { MARKER_OFEK_SIDEBAR_SECTIONS } from "@/lib/marker-ofek/marker-ofek-sidebar-nav-config"
import { FACILITY_HOME_PATH } from "@/lib/infrastructure/navigation/sidebar-routes"

/** אחידות: טקסט ואייקונים בכל פריטי מרקר אופק */
const navBtnClass = cn(
  "gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
)

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/marker-ofek") {
    return pathname === "/marker-ofek" || pathname === "/marker-ofek/"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MarkerOfekSidebarNav({
  pathname,
  closeMobileNav,
}: {
  pathname: string
  closeMobileNav: () => void
}) {
  return (
    <>
      {MARKER_OFEK_SIDEBAR_SECTIONS.map((section) => (
        <SidebarGroup key={section.id} className="py-0">
          <details className="mo-pillar-details" open={section.defaultOpen}>
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-all duration-200",
                "hover:bg-sidebar-accent",
                "[&::-webkit-details-marker]:hidden"
              )}
            >
              <span className="min-w-0 truncate text-start leading-snug">
                {section.label}
              </span>
              <ChevronDown
                className="mo-pillar-chevron size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out"
                aria-hidden
              />
            </summary>
            <SidebarGroupContent className="pt-1 ps-0.5">
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem
                      key={`${section.id}-${item.href}-${item.title}`}
                    >
                      <SidebarMenuButton
                        isActive={isActivePath(pathname, item.href)}
                        tooltip={item.title}
                        className={navBtnClass}
                        render={
                          <Link href={item.href} onClick={closeMobileNav}>
                            <Icon />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        }
                      />
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </details>
        </SidebarGroup>
      ))}

      <SidebarGroup>
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          מערכות
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="חזרה לפורטל אחזקה"
                className={cn(navBtnClass, "text-muted-foreground")}
                render={
                  <Link href={FACILITY_HOME_PATH} onClick={closeMobileNav}>
                    <ArrowRightLeft />
                    <span>פורטל אחזקה</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
