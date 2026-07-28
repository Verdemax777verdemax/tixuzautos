async function main() {
  const query = `query Locations { products(search: "", pageSize: 50, currentPage: 1) { total_count items { showroom_details { name state } custom_attributes { attribute_metadata { code } entered_attribute_value { value } selected_attribute_options { attribute_option { label } } } } } }`;
  const response = await fetch('https://automarket.bbva.mx/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Store: 'default' },
    body: JSON.stringify({ query })
  });
  const payload = await response.json();
  const items = payload.data?.products?.items || [];
  const attribute = (item, code) => {
    const row = (item.custom_attributes || []).find(value => value.attribute_metadata?.code === code);
    const option = Array.isArray(row?.selected_attribute_options?.attribute_option)
      ? row.selected_attribute_options.attribute_option[0]
      : row?.selected_attribute_options?.attribute_option;
    return row?.entered_attribute_value?.value || option?.label || null;
  };
  const locations = [...new Map(items.map(item => {
    const location = item.showroom_details || {};
    const value = {
      name: location.name || attribute(item, 'showroom_effective') || attribute(item, 'showroom'),
      state: location.state,
      state_iso: attribute(item, 'state_iso')
    };
    return [`${value.name}|${value.state}|${value.state_iso}`, value];
  })).values()];
  console.log(JSON.stringify({ total_count: payload.data?.products?.total_count, sample_size: items.length, locations }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
