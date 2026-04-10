export default function SearchLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-muted min-h-[100dvh] overflow-hidden">
            {children}
        </div>
    );
}
