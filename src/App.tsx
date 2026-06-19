import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import FMRadio from './pages/FMRadio';
import AMRadio from './pages/AMRadio';
import ATCRadio from './pages/ATCRadio';
import HDRadio from './pages/HDRadio';
import ADSBTracker from './pages/ADSBTracker';
import TVPage from './pages/TVPage';
import TVGuide from './pages/TVGuide';
import { TVPlayerProvider } from './hooks/useTVPlayer';

function App() {
  return (
    <TVPlayerProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="fm" element={<FMRadio />} />
          <Route path="am" element={<AMRadio />} />
          <Route path="atc" element={<ATCRadio />} />
          <Route path="hd" element={<HDRadio />} />
          <Route path="tv" element={<TVPage />} />
          <Route path="guide" element={<TVGuide />} />
          <Route path="adsb" element={<ADSBTracker />} />
        </Route>
      </Routes>
    </TVPlayerProvider>
  );
}

export default App;
