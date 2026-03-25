export default function ProductivityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {children}
    </div>
  )
}
