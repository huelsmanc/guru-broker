import React, { useEffect, useState } from 'react';
import { MapPin, DollarSign, Maximize2, X } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons
const createMarkerIcon = (isSubject = false) => {
  return L.divIcon({
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${isSubject ? '#667eea' : '#a855f7'};
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-size: 16px;
    ">
      📍
    </div>`,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

// Bounds fitter component
const BoundsFitter = ({ locations }) => {
  const map = useMap();
  
  useEffect(() => {
    if (locations.length === 0) return;
    
    const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [locations, map]);
  
  return null;
};

export default function CMAMap({ address, comparables, onSelectProperty }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const geocodeAddresses = async () => {
      try {
        setLoading(true);
        setError('');
        
        // Geocode subject property
        const subjectCoords = await geocodeAddress(address);
        if (!subjectCoords) {
          setError('Could not locate subject property');
          setLoading(false);
          return;
        }

        const locs = [
          {
            id: 'subject',
            address,
            lat: subjectCoords.lat,
            lng: subjectCoords.lng,
            isSubject: true,
            type: 'Subject Property',
          },
        ];

        // Geocode comparable properties
        if (comparables?.length > 0) {
          for (const comp of comparables) {
            const coords = await geocodeAddress(comp.address);
            if (coords) {
              locs.push({
                id: comp.address,
                address: comp.address,
                lat: coords.lat,
                lng: coords.lng,
                isSubject: false,
                soldPrice: comp.soldPrice,
                sqft: comp.sqft,
                beds: comp.beds,
                baths: comp.baths,
                daysOnMarket: comp.daysOnMarket,
                soldDate: comp.soldDate,
                condition: comp.condition,
                upgrades: comp.upgrades,
                notes: comp.notes,
              });
            }
          }
        }

        setLocations(locs);
      } catch (err) {
        console.error('Geocoding error:', err);
        setError('Failed to load map locations');
      } finally {
        setLoading(false);
      }
    };

    geocodeAddresses();
  }, [address, comparables]);

  const geocodeAddress = async (addr) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`
      );
      const data = await response.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (err) {
      console.error('Geocoding failed for:', addr);
      return null;
    }
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-muted rounded-2xl border border-border/40 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground text-sm">Loading map with {comparables?.length || 0} properties...</p>
        </div>
      </div>
    );
  }

  if (error || locations.length === 0) {
    return (
      <div className="w-full h-96 bg-muted rounded-2xl border border-border/40 flex items-center justify-center">
        <div className="text-center">
          <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">{error || 'Unable to load map'}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-3"
    >
      <MapContainer 
        center={[locations[0].lat, locations[0].lng]} 
        zoom={13} 
        style={{ height: '400px', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }}
        className="rounded-2xl"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <BoundsFitter locations={locations.map(loc => [loc.lat, loc.lng])} />
        
        {locations.map((location) => (
          <Marker
            key={location.id}
            position={[location.lat, location.lng]}
            icon={createMarkerIcon(location.isSubject)}
          >
            <Popup>
              <div className="w-72">
                <div className="pb-3 border-b border-border/30">
                  <p className="font-semibold text-foreground text-sm">{location.address}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {location.isSubject ? '📍 Subject Property' : '🏠 Comparable Sale'}
                  </p>
                </div>

                {!location.isSubject && (
                  <>
                    <div className="py-3 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Sale Price:</span>
                        <span className="font-bold text-primary">
                          ${location.soldPrice?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Square Feet:</span>
                        <span className="font-semibold text-foreground">
                          {(location.sqft / 1000).toFixed(1)}K
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Beds • Baths:</span>
                        <span className="font-semibold text-foreground">
                          {location.beds} • {location.baths}
                        </span>
                      </div>
                      {location.daysOnMarket && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">DOM:</span>
                          <span className="font-semibold text-foreground">
                            {location.daysOnMarket} days
                          </span>
                        </div>
                      )}
                      {location.soldDate && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Sold:</span>
                          <span className="font-semibold text-foreground">
                            {location.soldDate}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedCompany(location);
                        onSelectProperty?.(location);
                      }}
                      className="w-full mt-3 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Maximize2 className="w-3 h-3" />
                      View Details
                    </button>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Property Details Panel */}
      {selectedCompany && !selectedCompany.isSubject && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="bg-card border border-primary/20 rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-semibold text-foreground">{selectedCompany.address}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Comparable Sale</p>
            </div>
            <button
              onClick={() => setSelectedCompany(null)}
              className="p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div className="bg-muted/40 rounded-lg p-2.5">
              <p className="text-muted-foreground text-xs mb-0.5">Sale Price</p>
              <p className="font-bold text-primary">${selectedCompany.soldPrice?.toLocaleString()}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5">
              <p className="text-muted-foreground text-xs mb-0.5">Price/Sq Ft</p>
              <p className="font-bold text-foreground">
                ${Math.round(selectedCompany.soldPrice / selectedCompany.sqft)}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5">
              <p className="text-muted-foreground text-xs mb-0.5">Square Feet</p>
              <p className="font-bold text-foreground">{(selectedCompany.sqft / 1000).toFixed(1)}K</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5">
              <p className="text-muted-foreground text-xs mb-0.5">Beds • Baths</p>
              <p className="font-bold text-foreground">{selectedCompany.beds} • {selectedCompany.baths}</p>
            </div>
          </div>

          {selectedCompany.condition && (
            <div className="text-xs mb-2">
              <p className="text-muted-foreground mb-0.5">Condition</p>
              <p className="text-foreground">{selectedCompany.condition}</p>
            </div>
          )}

          {selectedCompany.upgrades?.length > 0 && (
            <div className="text-xs">
              <p className="text-muted-foreground mb-0.5">Upgrades</p>
              <div className="flex flex-wrap gap-1">
                {selectedCompany.upgrades.slice(0, 3).map((upgrade, i) => (
                  <span key={i} className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                    {upgrade}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}