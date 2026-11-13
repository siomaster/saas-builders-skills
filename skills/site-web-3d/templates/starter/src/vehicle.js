import geometry from './data/car.json';

// Voiture en profil + roues découpées superposées (positions mesurées dans car.json).
// rotateWheels(el, distancePx) fait tourner les roues comme si la voiture avait parcouru cette distance.

export function mountVehicle(el) {
  el.innerHTML = '<img class="vehicle__body" src="/img/car.webp" alt="" />';
  el.style.aspectRatio = `${geometry.w} / ${geometry.h}`;
  const wheels = geometry.wheels.map((w) => {
    const img = document.createElement('img');
    img.className = 'vehicle__wheel';
    img.src = `/img/wheel-${w.name}.webp`;
    img.alt = '';
    const hPct = (w.d * geometry.w * 100) / geometry.h;
    Object.assign(img.style, {
      left: `${(w.cx - w.d / 2) * 100}%`,
      top: `${w.cy * 100 - hPct / 2}%`,
      width: `${w.d * 100}%`,
    });
    el.appendChild(img);
    return img;
  });
  return {
    el,
    wheels,
    rotate(distance) {
      // circonférence de la roue en pixels écran
      const circ = Math.PI * el.clientWidth * geometry.wheels[0].d;
      const deg = (distance / circ) * 360;
      wheels.forEach((w) => (w.style.transform = `rotate(${deg}deg)`));
    },
  };
}
