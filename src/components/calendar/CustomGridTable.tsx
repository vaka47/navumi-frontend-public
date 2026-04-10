import * as React from "react";

export function CustomGridTable({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className="grid w-full grid-cols-7 gap-px"
            role="grid"
            {...props}
        >
            {children}
        </div>
    );
}
