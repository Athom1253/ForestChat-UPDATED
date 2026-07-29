import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore } from '@/stores/toast'
import { cn } from '@/lib/utils'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'px-4 py-3 rounded-lg shadow-lg border flex items-start gap-3 cursor-pointer',
              t.type === 'success' && 'bg-success/20 border-success/50 text-success',
              t.type === 'error' && 'bg-error/20 border-error/50 text-error',
              t.type === 'info' && 'bg-primary/20 border-primary/50 text-primary',
              t.type === 'warning' && 'bg-warning/20 border-warning/50 text-warning',
            )}
            onClick={() => removeToast(t.id)}
          >
            <span className="flex-1 text-sm text-text">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
