export interface OSMNode {
  tags: {
    name: string;
    population?: string;
  };
}

const TOP_US_METROS = [
  "Dallas, Texas", "Houston, Texas", "San Antonio, Texas", "Austin, Texas",
  "Miami, Florida", "Tampa, Florida", "Orlando, Florida", "Atlanta, Georgia",
  "Chicago, Illinois", "Phoenix, Arizona", "Denver, Colorado", "Charlotte, North Carolina",
  "Raleigh, North Carolina", "Nashville, Tennessee", "San Diego, California",
  "Los Angeles, California", "San Francisco, California", "Seattle, Washington",
  "Las Vegas, Nevada", "Boston, Massachusetts", "Philadelphia, Pennsylvania",
  "New York, New York", "Columbus, Ohio", "Indianapolis, Indiana", "Salt Lake City, Utah"
];

async function getCoordinates(location: string): Promise<{ lat: number; lon: number; state: string } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&addressdetails=1&limit=1`, {
      headers: { 'User-Agent': 'MR2-Labs-Outreach-Engine/1.0 (growth@getmr2labs.com)' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { 
        lat: parseFloat(data[0].lat), 
        lon: parseFloat(data[0].lon), 
        state: data[0].address?.state || '' 
      };
    }
  } catch (err) { 
    console.warn('[OSM Nominatim Error]:', err); 
  }
  return null;
}

async function getNearbyCities(lat: number, lon: number): Promise<string[]> {
  const query = `
    [out:json][timeout:10];
    node(around:150000, ${lat}, ${lon})["place"~"city|town"];
    out tags;
  `;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'User-Agent': 'MR2-Labs-Outreach-Engine/1.0 (growth@getmr2labs.com)' }
    });
    const data = await res.json();
    if (data && data.elements) {
      const sorted = data.elements.sort((a: OSMNode, b: OSMNode) => parseInt(b.tags?.population || '0') - parseInt(a.tags?.population || '0'));
      return sorted.map((el: OSMNode) => el.tags?.name).filter(Boolean);
    }
  } catch (err) { 
    console.warn('[OSM Overpass Error]:', err); 
  }
  return [];
}

export async function getNextCityDynamic(currentLocation: string, exhaustedLocations: string[] = []): Promise<string> {
  console.log(`[Geo-Pivot] Searching OSM for cities near: ${currentLocation}`);
  const coords = await getCoordinates(currentLocation);

  if (coords) {
    const nearbyCities = await getNearbyCities(coords.lat, coords.lon);
    const freshCities = nearbyCities.filter(city => {
      const isExhausted = exhaustedLocations.some(ex => ex.toLowerCase().includes(city.toLowerCase()));
      return city.toLowerCase() !== currentLocation.split(',')[0].toLowerCase() && !isExhausted;
    });

    if (freshCities.length > 0) {
      return `${freshCities[0]}, ${coords.state || 'US'}`;
    }
  }

  // Robust Fallback: Cycle through TOP_US_METROS to find an un-exhausted major business metro
  const fallbackCity = TOP_US_METROS.find(m => {
    const cityName = m.split(',')[0].toLowerCase();
    const currentCityName = currentLocation.split(',')[0].toLowerCase();
    const isExhausted = exhaustedLocations.some(ex => ex.toLowerCase().includes(cityName));
    return cityName !== currentCityName && !isExhausted;
  });

  return fallbackCity || "Dallas, Texas"; 
}
