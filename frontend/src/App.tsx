import { StatusBanner } from './components/common/StatusBanner';
import { Header } from './components/layout/Header';
import { ObserverPanel } from './components/panels/ObserverPanel';
import { PassesPanel } from './components/panels/PassesPanel';
import { PositionPanel } from './components/panels/PositionPanel';
import { SkyViewPanel } from './components/panels/SkyViewPanel';
import { TrackingProvider, useTracking } from './context/TrackingContext';
import { useSatellitePasses } from './hooks/useSatellitePasses';
import { useSatellitePosition } from './hooks/useSatellitePosition';

function Dashboard() {
  const { noradId, geolocation, selectedPassIndex } = useTracking();
  const live    = useSatellitePosition(noradId, geolocation.observer);
  const upcoming = useSatellitePasses(noradId, geolocation.observer);

  const satellite    = live.position?.satellite ?? upcoming.passes?.satellite ?? null;
  const staleTle     = live.position?.stale_tle || upcoming.passes?.stale_tle || false;
  const selectedPass = upcoming.passes?.passes[selectedPassIndex] ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cosmos-950 text-slate-100">
      <Header isPolling={live.isPolling} />
      <StatusBanner satellite={satellite} staleTle={staleTle} />

      {/*
        Layout:
          Mobile (< md):   single column stack
          md (768–1279px): sidebar | [sky + passes stacked]
          xl (≥ 1280px):   sidebar | sky | passes
      */}
      <main className="flex-1 overflow-hidden p-3 md:p-4">
        <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_340px]">

          {/* ── Left sidebar ── */}
          <aside className="flex flex-col gap-3 overflow-y-auto">
            <ObserverPanel />
            <PositionPanel position={live.position} error={live.error} />
          </aside>

          {/* ── Center: sky radar ── */}
          {/* On md this is col 2, row 1. On xl it's col 2. */}
          <SkyViewPanel position={live.position} selectedPass={selectedPass} />

          {/* ── Right: passes list ── */}
          {/* On md this spans col 1-2 (row 2). On xl it's col 3. */}
          <div className="md:col-span-2 xl:col-span-1">
            <PassesPanel passes={upcoming.passes} error={upcoming.error} isLoading={upcoming.isLoading} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <TrackingProvider>
      <Dashboard />
    </TrackingProvider>
  );
}
