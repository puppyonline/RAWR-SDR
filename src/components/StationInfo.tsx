import StationLogo from './StationLogo';

interface StationInfoProps {
  callsign: string;
  frequency: number;
  format: string;
  unit?: string;
  details?: {
    city?: string;
    owner?: string;
    website?: string;
    power?: string;
    slogan?: string;
  };
  accentColor?: string;
  onClose?: () => void;
}

/**
 * Panel showing detailed info about a selected radio station.
 */
function StationInfo({ callsign, frequency, format, unit = 'MHz', details, accentColor = '#8b5cf6', onClose }: StationInfoProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <StationLogo callsign={callsign} size={40} fallbackColor={accentColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-primary">{callsign}</h3>
              <p className="text-xs text-muted">{frequency} {unit} &middot; {format}</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-muted hover:text-secondary p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>

          {details && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
              {details.city && <InfoRow label="City" value={details.city} />}
              {details.owner && <InfoRow label="Owner" value={details.owner} />}
              {details.power && <InfoRow label="Power" value={details.power} />}
              {details.slogan && <InfoRow label="Slogan" value={details.slogan} />}
              {details.website && (
                <div className="col-span-2">
                  <InfoRow label="Website" value={details.website} isLink />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div>
      <span className="text-2xs text-faint">{label}</span>
      {isLink ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="block text-xs text-brand-bright hover:underline truncate">{value}</a>
      ) : (
        <p className="text-xs text-secondary truncate">{value}</p>
      )}
    </div>
  );
}

export default StationInfo;
