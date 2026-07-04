import { AdminSidebar } from '@/components/layout/sidebar'

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-6">
          <span className="text-sm text-muted">Admin Panel</span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
