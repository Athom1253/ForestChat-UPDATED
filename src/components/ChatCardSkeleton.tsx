export default function ChatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg">
      <div className="skeleton w-11 h-11 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3.5 w-24 rounded" />
          <div className="skeleton h-3 w-10 rounded" />
        </div>
        <div className="skeleton h-3 w-40 rounded" />
      </div>
    </div>
  )
}
