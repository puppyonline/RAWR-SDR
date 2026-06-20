import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import FMRadio from './pages/FMRadio';
import ATCRadio from './pages/ATCRadio';
import HDRadio from './pages/HDRadio';
import ADSBTracker from './pages/ADSBTracker';
import TVPage from './pages/TVPage';
import TVGuide from './pages/TVGuide';
import WeatherRadio from './pages/WeatherRadio';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="fm" element={<FMRadio />} />
        <Route path="atc" element={<ATCRadio />} />
        <Route path="hd" element={<HDRadio />} />
        <Route path="tv" element={<TVPage />} />
        <Route path="guide" element={<TVGuide />} />
        <Route path="weather" element={<WeatherRadio />} />
        <Route path="adsb" element={<ADSBTracker />} />
      </Route>
    </Routes>
  );
}

export default App;
