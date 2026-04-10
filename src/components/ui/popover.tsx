"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
    const contentRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        const timeout = setTimeout(() => {
            const active = document.activeElement as HTMLElement | null
            if (
                active &&
                contentRef.current?.contains(active) &&
                (active.getAttribute("aria-label")?.toLowerCase().includes("предыдущий") ||
                    active.getAttribute("aria-label")?.toLowerCase().includes("следующий"))
            ) {
                active.blur()
            }
        }, 10)

        return () => clearTimeout(timeout)
    }, [])

    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                ref={(node: HTMLDivElement | null) => {
                    if (typeof ref === "function") {
                        ref(node)
                    } else if (ref) {
                        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
                    }
                    contentRef.current = node
                }}
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
                    className
                )}
                {...props}
                onOpenAutoFocus={(e) => e.preventDefault()}
            />
        </PopoverPrimitive.Portal>
    )
})

PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
