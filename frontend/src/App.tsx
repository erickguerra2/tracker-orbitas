/**
 * Esqueleto del dashboard de telemetría. La fase visual (Tailwind a fondo,
 * recharts para gráficos de elevación, animaciones) construirá sobre esta
 * estructura sin tocar hooks ni servicios.
 */

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
  const { noradId, geolocation } = useTracking();
  const live = useSatellitePosition(noradId, geolocation.observer);
  const upcoming = useSatellitePasses(noradId, geolocation.observer);

  const satellite = live.position?.satellite ?? upcoming.passes?.satellite ?? null;
  const staleTle = live.position?.stale_tle || upcoming.passes?.stale_tle || false;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header />
      <StatusBanner satellite={satellite} staleTle={staleTle} />
      <main className="mx-auto grid max-w-5xl gap-4 p-6 md:grid-cols-2">
        <ObserverPanel />
        <PositionPanel position={live.position} error={live.error} />
        <SkyViewPanel position={live.position} />
        <PassesPanel passes={upcoming.passes} error={upcoming.error} isLoading={upcoming.isLoading} />
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
