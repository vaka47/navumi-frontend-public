import * as React from "react";
//import { DayCell } from "react-day-picker";


export function CustomGridCell({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div role="gridcell" {...props}>
            {children}
        </div>
    );
}
