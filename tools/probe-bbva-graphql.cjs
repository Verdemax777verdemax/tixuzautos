const query = `
  query ProbeProducts {
    storeConfig { store_code base_media_url }
    products(search: "", pageSize: 2, currentPage: 1) {
      total_count
      items {
        id uid name sku url_key
        small_image { url }
        price_range { maximum_price { final_price { value currency } } }
        showroom_details { name state }
        custom_attributes {
          attribute_metadata { code label }
          entered_attribute_value { value }
          selected_attribute_options { attribute_option { label ... on AttributeOption { value } } }
        }
      }
    }
  }`;

async function main() {
  const response = await fetch('https://automarket.bbva.mx/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Store: 'default',
      'User-Agent': 'Mozilla/5.0 Chrome/124 TixuzBot/1.0'
    },
    body: JSON.stringify({ query })
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text.slice(0, 1000) }; }
  console.log(JSON.stringify({ status: response.status, bytes: text.length, data }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
