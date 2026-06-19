import { useStationLogo } from '../hooks/useStationLogos';

interface StationLogoProps {
  callsign: string;
  size?: number;
  fallbackColor?: string;
  className?: string;
}

/**
 * Displays a radio station logo fetched from radio-browser.info.
 * Shows a branded fallback with initials if no logo is found.
 */
function StationLogo({ callsign, size = 32, fallbackColor = '#8b5cf6', className = '' }: StationLogoProps) {
  const logo = useStationLogo(callsign);

  if (logo) {
    return (
      <img
        src={logo}
        alt={callsign}
        className={`rounded-md object-cover ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  // Fallback: colored box with initials
  const initials = callsign.replace(/^[WK]/, '').slice(0, 2).toUpperCase();
  return (
    <div
      className={`rounded-md flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: `${fallbackColor}20`, border: `1px solid ${fallbackColor}30` }}
    >
      <span className="font-bold text-2xs" style={{ color: fallbackColor }}>{initials}</span>
    </div>
  );
}

export default StationLogo;
