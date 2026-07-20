function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="h-4 w-28 rounded bg-slate-200" />
      <div className="mt-4 h-8 w-36 rounded bg-slate-200" />
      <div className="mt-3 h-3 w-44 max-w-full rounded bg-slate-100" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#f5f6f8] lg:pl-[252px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[252px] animate-pulse bg-[#11161d] lg:block" />
      <main className="px-4 py-6 sm:px-6 lg:px-7 2xl:px-9">
        <div className="flex animate-pulse flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="h-8 w-64 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-52 rounded bg-slate-200" />
          </div>
          <div className="h-12 w-full rounded-xl bg-slate-200 xl:w-[620px]" />
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonCard key={index} className="min-h-[144px]" />
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.75fr_0.9fr]">
          <SkeletonCard className="min-h-[370px]" />
          <SkeletonCard className="min-h-[370px]" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonCard key={index} className="min-h-[260px]" />
          ))}
        </div>
      </main>
    </div>
  );
}
