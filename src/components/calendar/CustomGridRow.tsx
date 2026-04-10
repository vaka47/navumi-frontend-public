import * as React from "react";

export function CustomGridRow({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <React.Fragment {...props}>
            {children}
        </React.Fragment>
    );
}
