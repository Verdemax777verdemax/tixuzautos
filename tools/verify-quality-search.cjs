const { runFastSearch } = require('../netlify/functions/buscar-externos.js');

function pct(count, total) {
  return total ? Math.round((count * 10000) / total) / 100 : 0;
}

(async () => {
  const payload = await runFastSearch('suzuki swift', '', true, true);
  const cars = payload.cars || [];
  const currentYear = new Date().getFullYear();
  const summary = {
    total: cars.length,
    km_pct: pct(cars.filter(car => Number(car.km) > 0).length, cars.length),
    city_pct: pct(cars.filter(car => Boolean(car.city)).length, cars.length),
    date_pct: pct(cars.filter(car => Boolean(car.published_at)).length, cars.length),
    price_pct: pct(cars.filter(car => Number(car.precio) > 0).length, cars.length),
    recent_below_60000: cars.filter(car => Number(car.precio) > 0 && Number(car.precio) < 60000 && Number(car.anio) > currentYear - 10).length,
    future_years: cars.filter(car => Number(car.anio) > currentYear + 1).length,
    broken_shape_images: cars.filter(car => car.thumbnail_url && !/^https:\/\//i.test(car.thumbnail_url)).length,
    failed_portals: payload.failed_portals || [],
    debug: payload.debug || null,
    cars: cars.map(car => ({
      portal: car.portal,
      title: car.title,
      year: car.anio,
      price: car.precio,
      km: car.km,
      city: car.city,
      state: car.state,
      published_at: car.published_at,
      image: car.thumbnail_url || null,
      url: car.url
    }))
  };
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
