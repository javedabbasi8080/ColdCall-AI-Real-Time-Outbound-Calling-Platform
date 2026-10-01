export interface MappedLeadRow {
  name: string;
  phone: string;
  email: string;
  company: string;
  timezone: string;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-./]/g, '');
}

function findColumnValue(
  row: Record<string, string>,
  mappingKey: string | undefined,
  aliases: string[],
): string {
  if (mappingKey && row[mappingKey] !== undefined) {
    return String(row[mappingKey] ?? '').trim();
  }

  const rowKeys = Object.keys(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    const exact = rowKeys.find((k) => normalizeKey(k) === normalizedAlias);
    if (exact && row[exact]?.trim()) return row[exact].trim();
  }

  for (const alias of aliases) {
    const partial = rowKeys.find((k) => normalizeKey(k).includes(normalizeKey(alias)));
    if (partial && row[partial]?.trim()) return row[partial].trim();
  }

  return '';
}

export function mapCsvRow(
  row: Record<string, string>,
  columnMapping?: Record<string, string>,
): MappedLeadRow {
  const company = findColumnValue(row, columnMapping?.company, [
    'company',
    'business',
    'businessname',
    'business_name',
    'organization',
    'org',
    'account',
  ]);

  const ownerName = findColumnValue(row, columnMapping?.name, [
    'name',
    'fullname',
    'full_name',
    'contact',
    'owner',
    'contactname',
    'contact_name',
    'firstname',
    'first_name',
  ]);

  const businessName = findColumnValue(row, undefined, [
    'businessname',
    'business_name',
    'companyname',
    'company_name',
  ]);

  const name = ownerName || businessName || company || 'Unknown';

  const phone = findColumnValue(row, columnMapping?.phone, [
    'phone',
    'phonenumber',
    'phone_number',
    'mobile',
    'telephone',
    'tel',
    'cell',
    'cellphone',
    'mainphone',
    'workphone',
  ]);

  const email = findColumnValue(row, columnMapping?.email, [
    'email',
    'emailaddress',
    'email_address',
    'e-mail',
    'mail',
  ]);

  const timezone = findColumnValue(row, columnMapping?.timezone, ['timezone', 'tz', 'time_zone']);

  return {
    name,
    phone,
    email,
    company: company || businessName || name,
    timezone,
  };
}
