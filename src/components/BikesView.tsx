import { Bike as BikeIcon, ChevronRight, Copy, Hash, Plus, Wrench } from 'lucide-react';
import type { Bike } from '../types';

interface BikesViewProps {
  bikes: Bike[];
  onSelectBike: (bikeId: string) => void;
  onAddBike: () => void;
  onCopySerial: (serial: string) => void;
}

export function BikesView({
  bikes,
  onSelectBike,
  onAddBike,
  onCopySerial,
}: BikesViewProps) {
  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">Bikes</h1>
      </div>

      {bikes.length === 0 ? (
        <div className="card empty-state">
          <BikeIcon size={28} />
          <p>Noch keine Fahrräder hinterlegt.</p>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={onAddBike}>
              <Plus size={16} />
              <span>Erstes Bike anlegen</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bikes-grid">
          {bikes.map((bike) => (
            <article
              key={bike.id}
              className="card bike-card"
              onClick={() => onSelectBike(bike.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectBike(bike.id);
                }
              }}
            >
              <div className="bike-card-media">
                {bike.imageUrl ? (
                  <img src={bike.imageUrl} alt={bike.name} loading="lazy" />
                ) : (
                  <div className="media-placeholder">
                    <BikeIcon size={36} />
                  </div>
                )}
              </div>

              <div className="bike-card-body">
                <div className="bike-card-top">
                  <div>
                    <div className="bike-card-brand">{bike.brand}</div>
                    <h2 className="bike-card-title">{bike.name}</h2>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </div>

                <div className="bike-specs-row">
                  {bike.modelYear && <span className="meta-chip">{bike.modelYear}</span>}
                  {bike.category && <span className="meta-chip">{bike.category}</span>}
                  {bike.frameSize && <span className="meta-chip">Größe {bike.frameSize}</span>}
                  {bike.wheelSize && <span className="meta-chip">{bike.wheelSize}</span>}
                </div>

                <div className="serial-box">
                  <div style={{ minWidth: 0 }}>
                    <span className="serial-label">Rahmennummer</span>
                    {bike.serialNumber ? (
                      <span className="serial-value">{bike.serialNumber}</span>
                    ) : (
                      <span className="serial-empty">Keine Seriennummer</span>
                    )}
                  </div>
                  {bike.serialNumber && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Seriennummer kopieren"
                      aria-label="Rahmennummer kopieren"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopySerial(bike.serialNumber);
                      }}
                    >
                      <Copy size={15} />
                    </button>
                  )}
                </div>

                <div className="bike-card-footer">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={14} />
                    {bike.partCount} {bike.partCount === 1 ? 'Teil verbaut' : 'Teile verbaut'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Hash size={14} />
                    {bike.serials.length} weitere
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
