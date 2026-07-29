import type { VmStatus } from '@nova/types'
import { cn } from '@/lib/utils'

const variants: Record<VmStatus, string> = {
  running:      'bg-green-50  text-green-800  dark:bg-green-950  dark:text-green-300',
  stopped:      'bg-gray-100  text-gray-700   dark:bg-gray-800   dark:text-gray-300',
  suspended:    'bg-amber-50  text-amber-800  dark:bg-amber-950  dark:text-amber-300',
  provisioning: 'bg-blue-50   text-blue-800   dark:bg-blue-950   dark:text-blue-300',
  pending:      'bg-blue-50   text-blue-800   dark:bg-blue-950   dark:text-blue-300',
  deleted:      'bg-red-50    text-red-800    dark:bg-red-950    dark:text-red-300',
  failed:       'bg-red-50    text-red-800    dark:bg-red-950    dark:text-red-300',
  starting:     'bg-blue-50   text-blue-800   dark:bg-blue-950   dark:text-blue-300',
  stopping:     'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  rebooting:    'bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
}

const labels: Record<VmStatus, string> = {
  running:      'Running',
  stopped:      'Stopped',
  suspended:    'Suspended',
  provisioning: 'Provisioning',
  pending:      'Pending',
  deleted:      'Deleted',
  failed:       'Failed',
  starting:     'Starting...',
  stopping:     'Stopping...',
  rebooting:    'Rebooting...',
}

const TRANSIENT = new Set<VmStatus>(['starting', 'stopping', 'rebooting', 'provisioning', 'pending'])

export function VmStatusBadge({ status }: { status: VmStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', variants[status] ?? variants.stopped)}>
      {TRANSIENT.has(status) && (
        <span className="w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
      )}
      {labels[status] ?? status}
    </span>
  )
}
