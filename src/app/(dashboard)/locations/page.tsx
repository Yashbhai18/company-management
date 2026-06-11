"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './locations.module.css';
import { useDialog } from '../../../components/ui/DialogProvider';
import dynamic from 'next/dynamic';

const DynamicMap = dynamic(() => import('../../../components/ui/LocationPickerMap'), { 
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder}>Loading Map...</div>
});

export default function LocationsPage() {
  const { alert, confirm } = useDialog();
  const [locations, setLocations] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const closeModalWithAnim = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      resetForm();
      setIsClosing(false);
    }, 250);
  };
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = React.useState(false);

  // Form state
  const [name, setName] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [radius, setRadius] = React.useState(300);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Search Debounce Logic
  React.useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearchingLocation(true);
      try {
        // Optimized Nominatim search: 
        // 1. Increased limit to 15
        // 2. Removed strict country restriction (countrycodes=in) to allow broader matches 
        //    while still prioritizing local results via language and details
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=15&addressdetails=1&namedetails=1&accept-language=en`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 500); // Reduced debounce from 800ms to 500ms for snappier feel

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const selectResult = (result: any) => {
    // Advanced name extraction
    const displayName = 
      result.namedetails?.name || 
      result.address?.hotel || 
      result.address?.office || 
      result.address?.commercial || 
      result.address?.building || 
      result.address?.amenity ||
      result.display_name.split(',')[0];
      
    const displayAddress = result.display_name;
    
    setName(displayName);
    setAddress(displayAddress);
    setLat(result.lat);
    setLng(result.lon);
    setSearchResults([]);
    setSearchQuery(displayName);
    setIsModalOpen(true);
  };

  const focusLocation = (loc: any) => {
    setLat(loc.lat.toString());
    setLng(loc.lng.toString());
    setRadius(loc.radius);
    // This will trigger the map to fly to the location
  };

  const fetchLocations = async () => {
    try {
      const res = await api.get('/organization/locations');
      const fetchedLocations = res.data.locations;
      setLocations(fetchedLocations);
      
      // Auto-focus the first location if available
      if (fetchedLocations.length > 0 && !lat && !lng) {
        const first = fetchedLocations[0];
        setLat(first.lat.toString());
        setLng(first.lng.toString());
        setRadius(first.radius);
      }
    } catch (err) {
      console.error('Failed to fetch locations', err);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLocations();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !lat || !lng) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name,
        address,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radius
      };

      if (editingId) {
        await api.patch(`/organization/locations/${editingId}`, payload);
      } else {
        await api.post('/organization/locations', payload);
      }
      
      closeModalWithAnim();
      fetchLocations();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save location');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (loc: any) => {
    setEditingId(loc._id);
    setName(loc.name);
    setAddress(loc.address || '');
    setLat(loc.lat.toString());
    setLng(loc.lng.toString());
    setRadius(loc.radius);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm('Are you sure you want to delete this location?');
    if (!ok) return;

    try {
      await api.delete(`/organization/locations/${id}`);
      fetchLocations();
    } catch (err: any) {
      alert('Failed to delete location');
    }
  };

  const resetForm = () => {
    setName('');
    setAddress('');
    setLat('');
    setLng('');
    setRadius(300);
    setEditingId(null);
  };

  const getCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLat(position.coords.latitude.toString());
        setLng(position.coords.longitude.toString());
      }, (err) => {
        alert('Could not get your current location. Please enter coordinates manually.');
      });
    }
  };

  const filteredLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (loc.address && loc.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2>Locations</h2>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search for a building, hotel..." 
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isSearchingLocation && (
              <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                <div className={styles.spinnerSmall}></div>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map((result, idx) => (
                  <div key={idx} className={styles.searchResultItem} onClick={() => selectResult(result)}>
                    <div className={styles.resultIcon}>
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className={styles.resultDetails}>
                      <span className={styles.resultName}>
                        {result.namedetails?.name || 
                         result.address?.hotel || 
                         result.address?.office || 
                         result.address?.commercial || 
                         result.address?.building || 
                         result.address?.amenity || 
                         result.display_name.split(',')[0]}
                      </span>
                      <span className={styles.resultAddress}>{result.display_name}</span>
                    </div>
                  </div>
                ))}
                <div className={styles.searchResultItem} style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem' }} onClick={() => { setIsModalOpen(true); setSearchResults([]); }}>
                  + Add missing location manually
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.locationList}>
          {isLoading ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : filteredLocations.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '120px', height: '120px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <svg width="60" height="60" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--primary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3>Geofence Your Workspace</h3>
              <p>Define office boundaries to automatically distinguish between on-site and remote clock-ins.</p>
            </div>
          ) : (
            filteredLocations.map((loc) => (
              <div key={loc._id} className={styles.locationItem} onClick={() => focusLocation(loc)} style={{ cursor: 'pointer' }}>
                <div className={styles.locationInfo}>
                  <h4>{loc.name}</h4>
                  <p>{loc.address || 'No address'}</p>
                  <p style={{ fontSize: '10px', color: '#999' }}>
                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} • {loc.radius}m radius
                  </p>
                </div>
                <div className={styles.locationActions}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleEdit(loc); }} 
                    className={styles.editBtn}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(loc._id); }} 
                    className={styles.deleteBtn}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.mapArea}>
        <DynamicMap 
          lat={parseFloat(lat) || 0} 
          lng={parseFloat(lng) || 0} 
          radius={radius} 
          onChange={(newLat, newLng) => {
            setLat(newLat.toString());
            setLng(newLng.toString());
          }}
          existingLocations={locations}
        />

        <button className={styles.addLocationBtn} onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add New Location
        </button>
      </div>

      {isModalOpen && (
        <div className={`${styles.modalOverlay} ${isClosing ? 'closingOverlay' : ''}`} onClick={closeModalWithAnim}>
          <form className={`${styles.modal} ${isClosing ? 'closingModal' : ''}`} onSubmit={handleSave} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Edit Location' : 'Add New Location'}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeModalWithAnim}>&times;</button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Location Name</label>
                <input 
                  className={styles.input} 
                  placeholder="e.g. Main Office" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Address (Optional)</label>
                <input 
                  className={styles.input} 
                  placeholder="e.g. 123 Business St" 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Coordinates 
                  <button type="button" onClick={getCurrentLocation} style={{ fontSize: '12px', color: '#ff7a30', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Use My Current Location
                  </button>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    className={styles.input} 
                    placeholder="Latitude" 
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                  />
                  <input 
                    className={styles.input} 
                    placeholder="Longitude" 
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Radius (Meters)</label>
                <div className={styles.radiusOptions}>
                  {[300, 400, 500, 1000].map((r) => (
                    <label key={r} className={styles.radiusOption}>
                      <input 
                        type="radio" 
                        name="radius" 
                        checked={radius === r}
                        onChange={() => setRadius(r)}
                      />
                      <span>{r} Meters</span>
                      {r === 300 && <span className={styles.recommended}>Recommended</span>}
                    </label>
                  ))}
                  <label className={styles.radiusOption}>
                    <input 
                      type="radio" 
                      name="radius" 
                      checked={![300, 400, 500, 1000].includes(radius)}
                      onChange={() => setRadius(600)}
                    />
                    <span>Custom radius</span>
                    {![300, 400, 500, 1000].includes(radius) && (
                      <input 
                        type="number" 
                        className={styles.input} 
                        style={{ width: '80px', padding: '4px 8px' }}
                        value={radius}
                        onChange={(e) => setRadius(parseInt(e.target.value) || 0)}
                      />
                    )}
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelBtn} onClick={closeModalWithAnim}>Cancel</button>
              <button type="submit" className={styles.saveBtn} disabled={isSaving}>
                {isSaving ? 'Saving...' : editingId ? 'Update Location' : 'Save Location'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
