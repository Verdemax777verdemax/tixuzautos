async function main() {
  for (const file of ['runtime.85c7ff0d73e7ca0559dd.js', 'client.934d68ff91304720d417.js']) {
    const text = await (await fetch(`https://automarket.bbva.mx/${file}`)).text();
    console.log(`\nBUNDLE ${file} bytes=${text.length}`);
    const urls = [...text.matchAll(/https?:\\?\\?[^"' ]{5,200}/g)]
      .map(match => match[0])
      .filter(value => /bbva|graphql|api|magento/i.test(value));
    console.log('urls', [...new Set(urls)].slice(0, 50));
    for (const marker of ['graphql', 'products(', 'fragment ProductFragment', 'query getProducts', 'query productDetail', 'url_key', 'categoryList', 'getProductSearch', 'page_info', 'mileage', 'kilometraje']) {
      const index = text.indexOf(marker);
      console.log('marker', marker, index, index >= 0 ? text.slice(Math.max(0, index - 180), index + 500) : '');
      if (marker === 'fragment ProductFragment' && index >= 0) {
        console.log('PRODUCT_FRAGMENT_LONG', text.slice(index, index + 8000));
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
