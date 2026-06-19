import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface GuideEntry {
  Title: string;
  EpisodeTitle?: string;
  StartTime: number;
  EndTime: number;
  Synopsis?: string;
}

interface GuideChannel {
  GuideNumber: string;
  GuideName: string;
  Guide?: GuideEntry[];
}

function TVGuide() {
  const [guide, setGuide] = useState<GuideChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<{ channel: GuideChannel; program: GuideEntry } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchGuide();
  }, []);

  const fetchGuide = async () => {
    try {
      const res = await fetch('/api/hdhr/guide');
      if (res.ok) {
        const data = await res.json();
        setGuide(data.filter((ch: any) => parseFloat(ch.GuideNumber) < 100));
      }
    } catch {}
    setLoading(false);
  };

  const watchChannel = (guideNumber: string) => {
    navigate(`/tv?ch=${guideNumber}`);
  };

  const handleProgramClick = (channel: GuideChannel, program: GuideEntry) => {
    const now = Math.floor(Date.now() / 1000);
    if (program.StartTime <= now && program.EndTime > now) {
      // Currently airing — tune to it
      watchChannel(channel.GuideNumber);
    } else {
      // Future/past — show details
      setSelectedProgram({ channel, program });
    }
  };

  const now = Math.floor(Date.now() / 1000);
  const startTime = now - (now % 1800);
  const endTime = startTime + 4 * 3600;
  const totalDuration = endTime - startTime;

  const timeSlots: number[] = [];
  for (let t = startTime; t < endTime; t += 1800) timeSlots.push(t);

  const formatTime = (ts: number) =>
    new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const getPosition = (ts: number) => ((ts - startTime) / totalDuration) * 100;
  const getWidth = (start: number, end: number) =>
    ((Math.min(end, endTime) - Math.max(start, startTime)) / totalDuration) * 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-zinc-500">Loading TV Guide...</span>
      </div>
    );
  }

  if (guide.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-zinc-400">No guide data available.</p>
        <p className="text-xs text-zinc-600 mt-2">Make sure your HDHomeRun is connected.</p>
        <Link to="/tv" className="btn-brand btn-sm mt-4 inline-flex">Go to Live TV</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">TV Guide</h1>
          <p className="section-subtitle mt-0.5">{guide.length} channels &middot; {formatTime(startTime)} &ndash; {formatTime(endTime)}</p>
        </div>
        <Link to="/tv" className="btn-ghost btn-sm">Watch Live</Link>
      </div>

      {/* EPG Grid */}
      <div className="card-flush overflow-hidden">
        {/* Time header */}
        <div className="flex border-b border-bg-border bg-bg-card sticky top-0 z-10">
          <div className="w-32 md:w-40 shrink-0 p-2 border-r border-bg-border">
            <span className="text-2xs text-zinc-500">Channel</span>
          </div>
          <div className="flex-1 relative h-8">
            {timeSlots.map((ts) => (
              <div key={ts} className="absolute top-0 h-full border-l border-bg-border flex items-center pl-2"
                style={{ left: `${getPosition(ts)}%` }}>
                <span className="text-2xs text-zinc-500 font-mono">{formatTime(ts)}</span>
              </div>
            ))}
            <div className="absolute top-0 h-full w-0.5 bg-brand z-10" style={{ left: `${getPosition(now)}%` }} />
          </div>
        </div>

        {/* Channel rows */}
        <div ref={gridRef} className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {guide.map((ch) => (
            <div key={ch.GuideNumber} className="flex border-b border-bg-border last:border-0 hover:bg-bg-hover/30 transition-colors">
              {/* Channel label — click to watch */}
              <button
                onClick={() => watchChannel(ch.GuideNumber)}
                className="w-32 md:w-40 shrink-0 p-2 border-r border-bg-border flex items-center gap-2 hover:bg-bg-hover/50 transition-colors text-left"
              >
                <span className="text-xs font-mono text-zinc-500 w-7">{ch.GuideNumber}</span>
                <span className="text-xs text-zinc-300 truncate">{ch.GuideName}</span>
              </button>

              {/* Programs */}
              <div className="flex-1 relative h-12 overflow-hidden">
                {ch.Guide?.filter((p) => p.EndTime > startTime && p.StartTime < endTime).map((program, i) => {
                  const left = getPosition(Math.max(program.StartTime, startTime));
                  const width = getWidth(program.StartTime, program.EndTime);
                  const isCurrent = program.StartTime <= now && program.EndTime > now;

                  return (
                    <button
                      key={i}
                      onClick={() => handleProgramClick(ch, program)}
                      className={`absolute top-1 bottom-1 rounded px-1.5 text-left overflow-hidden border transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-brand/10 border-brand/30 hover:bg-brand/20'
                          : 'bg-bg-raised border-bg-border hover:bg-bg-hover'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={isCurrent ? `${program.Title} — click to watch` : program.Title}
                    >
                      <span className={`text-2xs truncate block ${isCurrent ? 'text-brand-bright font-medium' : 'text-zinc-400'}`}>
                        {program.Title}
                      </span>
                      {program.EpisodeTitle && (
                        <span className="text-2xs text-zinc-600 truncate block">{program.EpisodeTitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Program detail panel */}
      {selectedProgram && (
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-zinc-500">{selectedProgram.channel.GuideNumber}</span>
                <span className="text-xs text-zinc-400">{selectedProgram.channel.GuideName}</span>
              </div>
              <h3 className="text-base font-semibold text-zinc-100">{selectedProgram.program.Title}</h3>
              {selectedProgram.program.EpisodeTitle && (
                <p className="text-sm text-zinc-400 mt-0.5">{selectedProgram.program.EpisodeTitle}</p>
              )}
              <p className="text-xs text-zinc-500 mt-2">
                {formatTime(selectedProgram.program.StartTime)} &ndash; {formatTime(selectedProgram.program.EndTime)}
              </p>
              {selectedProgram.program.Synopsis && (
                <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{selectedProgram.program.Synopsis}</p>
              )}
            </div>
            <button onClick={() => setSelectedProgram(null)} className="text-zinc-500 hover:text-zinc-300 p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="mt-4">
            <button onClick={() => watchChannel(selectedProgram.channel.GuideNumber)} className="btn-brand btn-sm">
              Watch {selectedProgram.channel.GuideName}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TVGuide;
