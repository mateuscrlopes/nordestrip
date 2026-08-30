export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-32 animate-pulse rounded-xl bg-petrol/8" />
      <div className="h-36 animate-pulse rounded-[28px] bg-surface" />
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded-lg bg-petrol/8" />
        <div className="h-20 animate-pulse rounded-[22px] bg-surface" />
        <div className="h-20 animate-pulse rounded-[22px] bg-surface" />
      </div>
    </div>
  );
}
