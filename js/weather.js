// Weather from open-meteo.com (free, no account or key).
import { setting } from './store.js';
import { load, save } from './util.js';

const ICON = (c) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️'
  : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';

export async function getWeather() {
  const lat = setting('lat');
  const lon = setting('lon');
  if (!lat || !lon) return null;
  const unit = setting('tempUnit', 'fahrenheit');
  const key = `${lat},${lon},${unit}`;
  const c = load('fh-weather');
  if (c && c.key === key && Date.now() - c.at < 30 * 60 * 1000) return c.data;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon + '&current=temperature_2m,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto' +
      '&temperature_unit=' + unit);
    const j = await r.json();
    const data = {
      icon: ICON(j.current.weather_code),
      temp: Math.round(j.current.temperature_2m),
      hi: Math.round(j.daily.temperature_2m_max[0]),
      lo: Math.round(j.daily.temperature_2m_min[0]),
    };
    save('fh-weather', { key, at: Date.now(), data });
    return data;
  } catch (e) {
    return c && c.key === key ? c.data : null;
  }
}

export async function searchPlace(name) {
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&name=' +
    encodeURIComponent(name));
  const j = await r.json();
  return (j.results || []).map((p) => ({
    label: [p.name, p.admin1, p.country_code].filter(Boolean).join(', '),
    lat: p.latitude.toFixed(3),
    lon: p.longitude.toFixed(3),
  }));
}
