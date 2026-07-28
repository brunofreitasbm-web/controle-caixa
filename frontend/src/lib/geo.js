export function getPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    );
  });
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function dentroDaCerca(pos, operacaoConfig) {
  if (!pos || !operacaoConfig || operacaoConfig.lat == null || operacaoConfig.lng == null) return true;
  const raio = Number(operacaoConfig.raio) || 150;
  const dist = distanceMeters(pos.lat, pos.lng, Number(operacaoConfig.lat), Number(operacaoConfig.lng));
  return { dentro: dist <= raio, distancia: dist, raio };
}
